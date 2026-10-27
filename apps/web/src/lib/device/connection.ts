'use client';

import {
  asciiCommands,
  bytesToHex,
  commands,
  connectSequence,
  decodeFrame,
  EnergyIntegrator,
  FrameAssembler,
  SimulatorTransport,
  summarizeFrame,
  wifiProvisionSequence,
  type DeviceTransport,
  type SwitchName,
  type TimerName,
} from '@myenergy/protocol';
import { WebBluetoothTransport } from '@/lib/ble/web-bluetooth-transport';
import { watchLive } from '@/lib/live';
import { useDevice, type DeviceInfo, type Telemetry } from '@/lib/store/device-store';
import { normalizeServiceUuid, useSettings } from '@/lib/store/settings-store';

/** Mirrors the original app's `maxContectSize = 3`. */
const MAX_RECONNECT_ATTEMPTS = 3;
/** Spacing between queued writes. */
const WRITE_SPACING_MS = 100;
const PREFERRED_CHAR_KEY = 'myenergy-preferred-char';
const TODAY_KEY = 'myenergy-today';

export interface LiveSnapshot {
  telemetry: Telemetry;
  info: DeviceInfo;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const todayKey = () => new Date().toLocaleDateString('en-CA');

function readPreferred(): { service: string; characteristic: string } | null {
  try {
    return JSON.parse(localStorage.getItem(PREFERRED_CHAR_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function asError(e: unknown): string {
  if (e instanceof DOMException && e.name === 'NotFoundError') return 'cancelled';
  return e instanceof Error ? e.message : String(e);
}

/**
 * Owns the active transport, the write queue, frame decoding and reconnects. UI talks to
 * it through `deviceConnection` and reads state from the zustand stores.
 */
class DeviceConnection {
  private transport: DeviceTransport | null = null;
  private unsubs: (() => void)[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private assembler = new FrameAssembler((hex) => this.handleFrame(hex));
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private integrator = new EnergyIntegrator();
  private todayBase = { whIn: 0, whOut: 0 };
  private generation = 0;
  private stopWatch: (() => void) | null = null;

  get demo(): SimulatorTransport | null {
    return this.transport instanceof SimulatorTransport ? this.transport : null;
  }

  get ble(): WebBluetoothTransport | null {
    return this.transport instanceof WebBluetoothTransport ? this.transport : null;
  }

  // ------------------------------------------------------------ lifecycle

  async connect(mode: 'ble' | 'demo', opts: { acceptAllDevices?: boolean } = {}): Promise<boolean> {
    await this.disconnect();
    const store = useDevice.getState();
    store.resetDevice();
    store.setMode(mode);
    const gen = ++this.generation;

    if (mode === 'demo') {
      this.transport = new SimulatorTransport();
      store.setStatus('connecting');
    } else {
      const custom = normalizeServiceUuid(useSettings.getState().customServiceUuid);
      this.transport = new WebBluetoothTransport({
        acceptAllDevices: opts.acceptAllDevices,
        extraServices: custom === null ? [] : [custom],
        preferred: readPreferred(),
        onPhase: (p) => gen === this.generation && store.setStatus(p === 'requesting' ? 'requesting' : 'connecting'),
      });
    }
    this.wire(this.transport);
    try {
      await this.transport.connect();
    } catch (e) {
      if (gen !== this.generation) return false;
      const msg = asError(e);
      this.teardown();
      useDevice.getState().setStatus(msg === 'cancelled' ? 'idle' : 'error', msg === 'cancelled' ? null : msg);
      if (msg === 'cancelled') useDevice.getState().setMode(null);
      return false;
    }
    if (gen !== this.generation) return false;
    this.onConnected();
    return true;
  }

  /** Read-only view of a device another browser is publishing through the API. */
  watch(sn: string, name: string | null): void {
    void this.disconnect();
    const store = useDevice.getState();
    store.resetDevice();
    store.setMode('watch');
    store.setStatus('connecting');
    store.patchInfo({ deviceSn: sn, bleName: name });
    this.stopWatch = watchLive<LiveSnapshot>(
      sn,
      (m) => {
        const s = useDevice.getState();
        if (s.status !== 'connected') s.setStatus('connected');
        s.patchInfo({ ...m.snapshot.info });
        s.patchTelemetry({ ...m.snapshot.telemetry, lastFrameAt: Date.now() });
        const p = m.snapshot.telemetry.power;
        if (p) s.pushHistory({ ts: m.ts, inW: p.inputW, outW: p.outputW, soc: m.snapshot.telemetry.soc });
      },
      () => useDevice.getState().setStatus('disconnected', 'The publishing browser went offline'),
    );
  }

  async disconnect(): Promise<void> {
    this.generation++;
    this.stopWatch?.();
    this.stopWatch = null;
    const t = this.transport;
    this.teardown();
    if (t) {
      try {
        await t.disconnect();
      } catch {
        // ignore
      }
      if (t instanceof WebBluetoothTransport) t.forget();
    }
    const s = useDevice.getState();
    if (s.status !== 'idle') s.setStatus('idle');
    s.setMode(null);
  }

  private wire(t: DeviceTransport) {
    this.unsubs.push(
      t.onNotify((bytes) => {
        this.assembler.push(bytes);
        if (this.flushTimer) clearTimeout(this.flushTimer);
        this.flushTimer = setTimeout(() => this.assembler.flush(), 600);
      }),
      t.onDisconnect((reason) => void this.handleDrop(reason)),
    );
  }

  private teardown() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.assembler = new FrameAssembler((hex) => this.handleFrame(hex));
    this.queue = Promise.resolve();
    this.transport = null;
  }

  /** After a reconnect the session (and its energy counters) simply continues. */
  private onConnected(isReconnect = false) {
    const s = useDevice.getState();
    s.setStatus('connected');
    s.setReconnectAttempt(0);
    s.patchInfo({ bleName: this.transport?.deviceName ?? null });
    if (this.ble) s.setGatt(this.ble.details ? { ...this.ble.details } : null);
    if (!isReconnect) {
      this.integrator.reset();
      this.loadToday();
      s.setEnergy({ startedAt: Date.now(), whIn: 0, whOut: 0 }, { date: todayKey(), ...this.todayBase });
    }
    this.runConnectSequence();
  }

  /** `YICHU|SN|?` at +100 ms, `YICHU|VER?` at +300, `0C` at +500, `0A` at +700 — like the app. */
  private runConnectSequence() {
    for (const step of connectSequence()) {
      this.timers.push(setTimeout(() => void this.send(step.bytes, step.label), step.at));
    }
  }

  private async handleDrop(reason: string) {
    const t = this.transport;
    if (!t) return;
    const gen = this.generation;
    const s = useDevice.getState();
    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      if (gen !== this.generation) return;
      s.setStatus('reconnecting', reason);
      s.setReconnectAttempt(attempt);
      await sleep(800 * attempt);
      if (gen !== this.generation) return;
      try {
        await t.connect();
        if (gen !== this.generation) return;
        this.onConnected(true);
        return;
      } catch (e) {
        reason = asError(e);
      }
    }
    if (gen === this.generation) s.setStatus('disconnected', reason);
  }

  // ------------------------------------------------------------ writes

  /** Queue a write; writes are spaced ~100 ms apart and never fragmented. */
  send(bytes: Uint8Array, label?: string): Promise<void> {
    const t = this.transport;
    if (!t) return Promise.reject(new Error('Not connected'));
    const run = async () => {
      if (this.transport !== t) return;
      const hex = bytesToHex(bytes);
      const decoded = decodeFrame(hex);
      useDevice.getState().logFrame({
        ts: Date.now(),
        dir: 'tx',
        hex,
        type: hex.startsWith('4d4d') ? `cmd ${hex.slice(8, 10).toUpperCase()}` : 'ascii',
        summary: label ?? (decoded.type === 'ascii' ? decoded.text : `cmd ${hex.slice(8, 10)}`),
        crcOk: null,
      });
      await t.write(bytes);
      await sleep(WRITE_SPACING_MS);
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  get canControl(): boolean {
    return !!this.transport && useDevice.getState().status === 'connected';
  }

  async setSwitch(name: SwitchName, on: boolean) {
    useDevice.getState().setPending(name, on);
    try {
      await this.send(commands.setSwitch(name, on), `${name} ${on ? 'on' : 'off'}`);
    } catch (e) {
      useDevice.getState().setPending(name, null);
      throw e;
    }
  }

  setTimer(name: TimerName, value: number) {
    return this.send(commands.setTimer(name, value), `timer ${name} = ${value}`);
  }

  setChargeLimit(watts: number) {
    return this.send(commands.setChargeLimit(watts), `charge limit ${watts} W`);
  }

  setLightMode(mode: number) {
    return this.send(commands.setLightMode(mode), `light mode ${mode}`);
  }

  setBacklight(level: number) {
    return this.send(commands.setBacklight(level), `backlight ${level}`);
  }

  /** Manual refresh: re-send the 0C / 0A queries. */
  async refresh() {
    await this.send(commands.queryVersions(), '0C versions');
    await this.send(commands.queryModelInfo(), '0A model info');
  }

  queryWifi() {
    useDevice.getState().setWifiReply(null);
    return this.send(asciiCommands.queryWifi(), 'YICHU|WIFI|?');
  }

  clearWifi() {
    return this.send(asciiCommands.clearWifi(), 'YICHU|WIFI_CTL|CLEAN');
  }

  /** Credentials → reset at +500 ms → WiFi off at +1500 ms → on at +1800 ms. */
  async provisionWifi(ssid: string, password: string) {
    const steps = wifiProvisionSequence(ssid, password);
    const start = Date.now();
    for (const step of steps) {
      const wait = step.at - (Date.now() - start);
      if (wait > 0) await sleep(wait);
      // Never log the password itself.
      await this.send(step.bytes, step.label === 'YICHU|WIFI|…' ? `YICHU|WIFI|${ssid}|••••••` : step.label);
    }
  }

  async selectCharacteristic(service: string, characteristic: string) {
    const ble = this.ble;
    if (!ble) return;
    await ble.select(service, characteristic);
    localStorage.setItem(PREFERRED_CHAR_KEY, JSON.stringify({ service, characteristic }));
    useDevice.getState().setGatt(ble.details ? { ...ble.details } : null);
  }

  /** Test hook for the demo: pretend the radio link dropped. */
  simulateLinkLoss() {
    this.demo?.dropLink('Simulated link loss');
  }

  // ------------------------------------------------------------ frames

  private handleFrame(hex: string) {
    const f = decodeFrame(hex);
    const s = useDevice.getState();
    const now = Date.now();
    const crcOk = 'frame' in f ? f.frame.crcOk : null;
    if (crcOk === false) console.warn('[myenergy] response CRC mismatch (kept):', hex);
    s.logFrame({ ts: now, dir: 'rx', hex, type: f.type, summary: summarizeFrame(f), crcOk });

    switch (f.type) {
      case 'ascii': {
        const r = f.reply;
        if (r.kind === 'sn') {
          s.patchInfo({
            gatewaySn: r.data.gatewaySn || null,
            ...(r.data.deviceSn ? { deviceSn: r.data.deviceSn } : {}),
            ...(r.data.deptCode ? { deptCode: r.data.deptCode } : {}),
            ...(r.data.deviceModelCode ? { modelCode: r.data.deviceModelCode } : {}),
          });
        } else if (r.kind === 'ver') {
          s.patchInfo({ versions: { ...r.data } });
        } else if (r.kind === 'wifi') {
          s.setWifiReply(f.text.trim());
        }
        break;
      }
      case 'versions': {
        const { deviceSn, ...versions } = f.data;
        const clean = Object.fromEntries(Object.entries(versions).filter(([, v]) => !!v)) as Record<string, string>;
        s.patchInfo({ versions: clean, ...(deviceSn ? { deviceSn } : {}) });
        break;
      }
      case 'model':
        s.patchInfo({ modelCode: f.data.deviceModelCode || null, deptCode: f.data.deptCode || null });
        break;
      case 'status': {
        s.patchTelemetry({ switches: f.data, switchBitmap: f.bitmap, lastFrameAt: now });
        // Reconcile optimistic switches: drop the ones the device confirmed.
        for (const [name, p] of Object.entries(s.pending)) {
          if (p && f.data[name as SwitchName] === p.value) s.setPending(name as SwitchName, null);
        }
        break;
      }
      case 'system': {
        const d = f.data;
        s.patchTelemetry({
          ...(d.power ? { power: d.power } : {}),
          ...(d.remainUsableTime !== undefined ? { remainUsableMin: d.remainUsableTime } : {}),
          ...(d.timersSet ? { timersSet: d.timersSet } : {}),
          ...(d.timersRemaining ? { timersRemaining: d.timersRemaining } : {}),
          ...(d.lightWorkMode !== undefined ? { lightWorkMode: d.lightWorkMode } : {}),
          ...(d.backlight !== undefined ? { backlight: d.backlight } : {}),
          ...(d.chargingPowerSetting !== undefined ? { chargeLimitW: d.chargingPowerSetting } : {}),
          lastFrameAt: now,
        });
        if (d.power) {
          s.pushHistory({ ts: now, inW: d.power.inputW, outW: d.power.outputW, soc: s.telemetry.soc });
          this.integrate(now, d.power.inputW, d.power.outputW);
        }
        break;
      }
      case 'battery':
        s.patchTelemetry({ soc: f.data.soc, tempC: f.data.tempC, temperaturesC: f.data.temperaturesC, lastFrameAt: now });
        break;
      case 'ack':
        if (!f.success) console.warn('[myenergy] device rejected command', f.frame.cmd.toString(16));
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------ energy counters

  private loadToday() {
    try {
      const raw = JSON.parse(localStorage.getItem(TODAY_KEY) ?? 'null') as { date: string; whIn: number; whOut: number } | null;
      this.todayBase = raw && raw.date === todayKey() ? { whIn: raw.whIn, whOut: raw.whOut } : { whIn: 0, whOut: 0 };
    } catch {
      this.todayBase = { whIn: 0, whOut: 0 };
    }
  }

  private integrate(ts: number, inW: number, outW: number) {
    const s = useDevice.getState();
    if (s.today.date && s.today.date !== todayKey()) {
      // Midnight rollover: start a new "today" from the current session totals.
      this.todayBase = { whIn: -this.integrator.whIn, whOut: -this.integrator.whOut };
    }
    this.integrator.add(ts, inW, outW);
    const session = { startedAt: s.session.startedAt, whIn: this.integrator.whIn, whOut: this.integrator.whOut };
    const today = {
      date: todayKey(),
      whIn: this.todayBase.whIn + this.integrator.whIn,
      whOut: this.todayBase.whOut + this.integrator.whOut,
    };
    s.setEnergy(session, today);
    try {
      localStorage.setItem(TODAY_KEY, JSON.stringify(today));
    } catch {
      // ignore quota errors
    }
  }
}

export const deviceConnection = new DeviceConnection();

if (typeof window !== 'undefined') {
  // Handy for debugging from the console.
  (window as unknown as { myenergy: DeviceConnection }).myenergy = deviceConnection;
}
