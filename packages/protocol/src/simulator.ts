/**
 * A virtual INFINITY 1000. It speaks the same bytes as the real device: it answers the
 * ASCII and binary queries, applies `60`–`63` set commands, and streams `50`/`51`/`53`
 * frames. Physics are simple but plausible: solar input with passing clouds, a fridge
 * compressor cycling on the AC rail, USB-C phone charging that tapers, SOC that follows
 * net power, and a temperature with thermal lag.
 */
import { utf8ToBytes, type Bytes } from './hex';
import { crc16Modbus } from './crc';
import {
  encodeAck,
  encodeBattery,
  encodeModelInfo,
  encodeStatus,
  encodeSystem,
  encodeVersions,
} from './responses';
import {
  Cmd,
  SwitchTag,
  TimerTag,
  TIMER_UNITS,
  type PowerReadings,
  type SwitchName,
  type SwitchStates,
  type TimerName,
  type TimerSettings,
} from './types';
import { Listeners, type DeviceTransport } from './transport';

export interface SimulatorOptions {
  deviceSn?: string;
  gatewaySn?: string;
  deptCode?: string;
  deviceModelCode?: string;
  capacityWh?: number;
  initialSoc?: number;
  /** Deterministic randomness for tests. */
  seed?: number;
  /** Rated AC inverter output; loads above trip the AC output. */
  ratedAcW?: number;
}

export interface SimulatorScenario {
  /** Solar panels plugged into the DC input. */
  solar: boolean;
  /** Peak solar watts (scaled by a slow sine + clouds). */
  solarPeakW: number;
  /** Wall charger plugged into the AC input. */
  acCharger: boolean;
  /** Extra AC load (W) the user dialed in from the demo panel. */
  extraAcLoadW: number;
}

export interface SimulatorState {
  socExact: number;
  tempC: number;
  ambientC: number;
  switches: SwitchStates;
  timersSet: TimerSettings;
  /** Remaining time in seconds for each timer (0 = not running). */
  timersRemainingS: TimerSettings;
  lightWorkMode: number;
  backlight: number;
  chargeLimitW: number;
  power: PowerReadings;
  wifiSsid: string | null;
  scenario: SimulatorScenario;
  /** Simulated seconds since start. */
  t: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIMER_NAMES: TimerName[] = ['autoShutdown', 'screenOff', 'dcAutoOff', 'acAutoOff', 'usbAutoOff'];

const EMPTY_TIMERS: TimerSettings = { autoShutdown: 0, screenOff: 0, dcAutoOff: 0, acAutoOff: 0, usbAutoOff: 0 };

export class PowerStationSimulator {
  readonly info: Required<Omit<SimulatorOptions, 'seed' | 'initialSoc'>> & {
    versions: Record<string, string>;
  };
  state: SimulatorState;
  private readonly rand: () => number;
  private fridgeOn = true;
  private fridgeToggleAt = 0;
  private cloud = 1;

  constructor(opts: SimulatorOptions = {}) {
    this.rand = mulberry32(opts.seed ?? 0x5eed);
    this.info = {
      deviceSn: opts.deviceSn ?? 'YC1K24A0019',
      gatewaySn: opts.gatewaySn ?? 'GW8F3A21C07',
      deptCode: opts.deptCode ?? '103',
      deviceModelCode: opts.deviceModelCode ?? 'MGI106MG2HEU',
      capacityWh: opts.capacityWh ?? 1024,
      ratedAcW: opts.ratedAcW ?? 1000,
      versions: {
        mainControlVersion: '1.2.7',
        inverterDcVersion: '1.0.4',
        inverterAcVersion: '1.1.2',
        bmsVersion: '2.0.3',
        hdMainControlVersion: '1.0',
        hdInverterDcVersion: '1.0',
        hdInverterAcVersion: '1.1',
        hdBmsVersion: '1.0',
        softwareVersion: '1.7.9',
      },
    };
    this.state = {
      socExact: opts.initialSoc ?? 76.4,
      tempC: 27.5,
      ambientC: 24,
      switches: {
        acOutput: true,
        dcOutput: true,
        usbOutput: true,
        acChargerConnected: false,
        dcChargerConnected: true,
        acConstantPower: false,
        silentMode: false,
        keySound: true,
        wifi: false,
      },
      timersSet: { autoShutdown: 0, screenOff: 300, dcAutoOff: 0, acAutoOff: 120, usbAutoOff: 0 },
      timersRemainingS: { ...EMPTY_TIMERS, acAutoOff: 120 * 60, screenOff: 300 },
      lightWorkMode: 0,
      backlight: 60,
      chargeLimitW: 800,
      power: emptyPower(),
      wifiSsid: null,
      scenario: { solar: true, solarPeakW: 320, acCharger: false, extraAcLoadW: 0 },
      t: 0,
    };
    this.recomputePower(0);
  }

  get soc(): number {
    return Math.round(this.state.socExact);
  }

  setScenario(patch: Partial<SimulatorScenario>): void {
    Object.assign(this.state.scenario, patch);
    this.state.switches.acChargerConnected = this.state.scenario.acCharger;
    this.state.switches.dcChargerConnected = this.state.scenario.solar;
    this.recomputePower(0);
  }

  /** Handle bytes written by the app. Returns the frames the device answers with. */
  handleWrite(bytes: ArrayLike<number>): Bytes[] {
    const b = Uint8Array.from(bytes);
    if (b[0] === 0x4d && b[1] === 0x4d) return this.handleBinary(b);
    const text = new TextDecoder().decode(b);
    if (text.startsWith('YICHU')) return this.handleAscii(text);
    return [];
  }

  private handleAscii(text: string): Bytes[] {
    const t = text.replace(/\r?\n$/, '');
    const { info } = this;
    if (t === 'YICHU|SN|?') {
      return [
        utf8ToBytes(`YICHU|SN|${info.gatewaySn}|${info.deviceSn}|${info.deptCode}|${info.deviceModelCode}\r\n`),
      ];
    }
    if (t === 'YICHU|VER?') {
      const hex = (v: string) => v.split('.').map((n) => Number(n).toString(16).padStart(2, '0')).join('');
      const v = info.versions;
      return [
        utf8ToBytes(
          `YICHU|VER|${hex(v.softwareVersion!)}|${hex(v.hdMainControlVersion!)}|${hex(v.hdInverterDcVersion!)}|${hex(v.hdInverterAcVersion!)}|${hex(v.hdBmsVersion!)}\r\n`,
        ),
      ];
    }
    if (t === 'YICHU|WIFI|?') {
      return [utf8ToBytes(`YICHU|WIFI|${this.state.wifiSsid ?? ''}|${this.state.switches.wifi ? 1 : 0}\r\n`)];
    }
    if (t.startsWith('YICHU|WIFI|')) {
      this.state.wifiSsid = t.split('|')[2] ?? null;
      return [utf8ToBytes('YICHU|WIFI|OK\r\n')];
    }
    if (t === 'YICHU|WIFI_RESET') return [utf8ToBytes('YICHU|WIFI_RESET|OK\r\n')];
    if (t === 'YICHU|WIFI_CTL|CLEAN') {
      this.state.wifiSsid = null;
      return [utf8ToBytes('YICHU|WIFI_CTL|OK\r\n')];
    }
    return [];
  }

  private handleBinary(b: Uint8Array): Bytes[] {
    if (b.length < 9) return [];
    const crc = crc16Modbus(b, 0, b.length - 2);
    if (b[b.length - 2] !== (crc & 0xff) || b[b.length - 1] !== crc >> 8) return [];
    const cmd = b[4]!;
    const p = b.subarray(7, b.length - 2);
    const s = this.state;
    switch (cmd) {
      case Cmd.Versions:
        return [encodeVersions({ ...this.info.versions, deviceSn: this.info.deviceSn })];
      case Cmd.ModelInfo:
        return [encodeModelInfo(`${this.info.deptCode}\n`, this.info.deviceModelCode)];
      case Cmd.SetSwitch: {
        const name = (Object.keys(SwitchTag) as SwitchName[]).find((k) => SwitchTag[k] === p[0]);
        if (!name) return [encodeAck(cmd, false)];
        s.switches[name] = p[1] === 1;
        if (name === 'acOutput' && s.switches.acOutput) this.restartTimer('acAutoOff');
        if (name === 'dcOutput' && s.switches.dcOutput) this.restartTimer('dcAutoOff');
        if (name === 'usbOutput' && s.switches.usbOutput) this.restartTimer('usbAutoOff');
        this.recomputePower(0);
        return [encodeAck(cmd), encodeStatus(s.switches)];
      }
      case Cmd.SetTimer: {
        const name = TIMER_NAMES.find((k) => TimerTag[k] === p[0]);
        if (!name || p.length < 3) return [encodeAck(cmd, false)];
        s.timersSet[name] = (p[1]! << 8) | p[2]!;
        this.restartTimer(name);
        return [encodeAck(cmd)];
      }
      case Cmd.SetChargeLimit: {
        if (p[0] !== 0xa2 || p.length < 3) return [encodeAck(cmd, false)];
        s.chargeLimitW = (p[1]! << 8) | p[2]!;
        this.recomputePower(0);
        return [encodeAck(cmd)];
      }
      case Cmd.SetDisplay: {
        if (p[0] === 0xa0) s.lightWorkMode = p[1] ?? 0;
        else if (p[0] === 0xa1) s.backlight = p[1] ?? 0;
        else return [encodeAck(cmd, false)];
        return [encodeAck(cmd)];
      }
      default:
        return [];
    }
  }

  private restartTimer(name: TimerName): void {
    const set = this.state.timersSet[name];
    this.state.timersRemainingS[name] = TIMER_UNITS[name] === 'seconds' ? set : set * 60;
  }

  /** Advance the simulation by `dt` seconds. */
  tick(dt: number): void {
    const s = this.state;
    s.t += dt;
    this.recomputePower(dt);
    const p = s.power;

    // Battery: charge efficiency ~94 %, discharge losses via inverter/converter efficiency,
    // plus inverter idle consumption whenever AC output is on.
    const idleW = s.switches.acOutput ? 9 : 2;
    const drawW = p.acOutputW / 0.88 + (p.dcOutputW + p.usbAW + p.usbCW + p.wirelessW) / 0.95 + idleW;
    const netWh = ((p.inputW * 0.94 - drawW) * dt) / 3600;
    s.socExact = Math.max(0, Math.min(100, s.socExact + (netWh / this.info.capacityWh) * 100));
    if (s.socExact <= 0.5) {
      s.switches.acOutput = false;
      s.switches.dcOutput = false;
      s.switches.usbOutput = false;
    }

    // Temperature: first-order lag towards ambient + heat from throughput.
    const target = s.ambientC + (p.inputW + p.outputW) / 70 + (s.switches.acOutput ? 1.5 : 0);
    s.tempC += (target - s.tempC) * Math.min(1, dt / 90) + (this.rand() - 0.5) * 0.04;

    // Timers count down while their output is on.
    const running: Record<TimerName, boolean> = {
      autoShutdown: p.outputW < 1 && p.inputW < 1,
      screenOff: true,
      acAutoOff: s.switches.acOutput,
      dcAutoOff: s.switches.dcOutput,
      usbAutoOff: s.switches.usbOutput,
    };
    for (const name of TIMER_NAMES) {
      if (!s.timersSet[name] || !running[name]) continue;
      const left = s.timersRemainingS[name] - dt;
      s.timersRemainingS[name] = Math.max(0, left);
      if (left <= 0) {
        if (name === 'acAutoOff') s.switches.acOutput = false;
        if (name === 'dcAutoOff') s.switches.dcOutput = false;
        if (name === 'usbAutoOff') s.switches.usbOutput = false;
        if (name === 'screenOff') this.restartTimer('screenOff');
      }
    }
    this.recomputePower(0);
  }

  private recomputePower(dt: number): void {
    const s = this.state;
    const sw = s.switches;
    const r = this.rand;
    const noise = (amp: number) => (r() - 0.5) * 2 * amp;

    // Fridge compressor: ~10 min on / ~18 min off.
    if (dt > 0 && s.t >= this.fridgeToggleAt) {
      this.fridgeOn = !this.fridgeOn;
      this.fridgeToggleAt = s.t + (this.fridgeOn ? 540 + r() * 180 : 900 + r() * 300);
    }
    if (dt > 0) this.cloud = Math.max(0.35, Math.min(1, this.cloud + noise(0.04) * Math.sqrt(dt)));

    const acW = sw.acOutput
      ? Math.max(0, (this.fridgeOn ? 128 + noise(6) : 0) + 62 + noise(3) + s.scenario.extraAcLoadW)
      : 0;
    if (sw.acOutput && acW > this.info.ratedAcW * 1.2) sw.acOutput = false; // overload trip
    // DC rail: a Wi-Fi router on the 5521 port; the car socket is idle.
    const dcW = sw.dcOutput ? 11.5 + noise(0.6) : 0;
    const carW = 0;
    // Phone on USB-C tapers as it fills (loops every ~40 min).
    const phase = (s.t % 2400) / 2400;
    const usbC1 = sw.usbOutput ? Math.max(2, 18 * (1 - phase) + noise(0.8)) : 0;
    const usbC2 = sw.usbOutput && phase < 0.5 ? 27 + noise(1.5) : 0;
    const usbA = sw.usbOutput ? 4.8 + noise(0.3) : 0;
    const wireless = 0;

    // Solar: slow sine over ~30 min to keep the demo lively, times passing clouds.
    const sun = 0.75 + 0.25 * Math.sin((s.t / 1800) * Math.PI * 2);
    const full = s.socExact >= 99.5;
    const taper = s.socExact > 95 ? Math.max(0.05, (100 - s.socExact) / 5) : 1;
    let dcIn = s.scenario.solar ? s.scenario.solarPeakW * sun * this.cloud + noise(4) : 0;
    let acIn = s.scenario.acCharger ? Math.min(s.chargeLimitW, 1200) + noise(5) : 0;
    if (full) {
      dcIn = 0;
      acIn = s.scenario.acCharger ? acW : 0; // pass-through only
    } else {
      dcIn *= taper;
      acIn *= taper;
    }
    // Charging limit caps total input.
    const cap = s.chargeLimitW;
    if (acIn + dcIn > cap) acIn = Math.max(0, cap - dcIn);
    if (dcIn > cap) dcIn = cap;

    const ints = (v: number) => Math.max(0, Math.round(v));
    const usbCPortsW = [ints(usbC1), ints(usbC2)];
    const power: PowerReadings = {
      acInputW: ints(acIn),
      dcInputW: ints(dcIn),
      inputW: 0,
      acOutputW: ints(acW),
      dcOutputW: ints(dcW),
      carW: ints(carW),
      wirelessW: ints(wireless),
      usbAW: ints(usbA),
      usbCW: usbCPortsW[0]! + usbCPortsW[1]!,
      usbCPortsW,
      outputW: 0,
    };
    power.inputW = power.acInputW + power.dcInputW;
    power.outputW = power.acOutputW + power.dcOutputW + power.carW + power.wirelessW + power.usbAW + power.usbCW;
    s.power = power;
  }

  /** The device's own runtime estimate in minutes (deliberately a slightly different model). */
  remainUsableMinutes(): number {
    const p = this.state.power;
    const net = p.outputW - p.inputW;
    if (net <= 1) return 0;
    const wh = (this.state.socExact / 100) * this.info.capacityWh * 0.85;
    return Math.min(0xffff, Math.round((wh / (net * 1.08)) * 60));
  }

  /** Frames the device streams periodically. */
  statusFrame(): Bytes {
    return encodeStatus(this.state.switches);
  }

  systemFrame(): Bytes {
    const s = this.state;
    const native = (name: TimerName, secs: number) =>
      TIMER_UNITS[name] === 'seconds' ? Math.ceil(secs) : Math.ceil(secs / 60);
    const remaining = Object.fromEntries(
      TIMER_NAMES.map((n) => [n, s.timersSet[n] ? native(n, s.timersRemainingS[n]) : 0]),
    ) as unknown as TimerSettings;
    return encodeSystem({
      power: s.power,
      remainUsableTime: this.remainUsableMinutes(),
      timersSet: s.timersSet,
      timersRemaining: remaining,
      lightWorkMode: s.lightWorkMode,
      backlight: s.backlight,
      chargingPowerSetting: s.chargeLimitW,
    });
  }

  batteryFrame(): Bytes {
    const t = this.state.tempC;
    return encodeBattery({
      soc: this.state.socExact,
      temperaturesC: [t - 0.4, t + 0.6],
      reserved: [0x0c, 0xf2, 0x00, 0x64],
    });
  }
}

function emptyPower(): PowerReadings {
  return {
    inputW: 0,
    acInputW: 0,
    dcInputW: 0,
    outputW: 0,
    acOutputW: 0,
    dcOutputW: 0,
    carW: 0,
    wirelessW: 0,
    usbAW: 0,
    usbCW: 0,
    usbCPortsW: [0, 0],
  };
}

export interface SimulatorTransportOptions extends SimulatorOptions {
  /** Real-time interval between streamed frames. */
  intervalMs?: number;
  /** Simulated seconds per real second (1 = real time). */
  timeScale?: number;
  /** Delay before answering a write, to feel like a real link. */
  latencyMs?: number;
}

/** A `DeviceTransport` backed by the simulator, interchangeable with the BLE transport. */
export class SimulatorTransport implements DeviceTransport {
  readonly kind = 'demo' as const;
  readonly sim: PowerStationSimulator;
  timeScale: number;
  private readonly notify = new Listeners<[Uint8Array]>();
  private readonly dropped = new Listeners<[string]>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private readonly intervalMs: number;
  private readonly latencyMs: number;

  constructor(opts: SimulatorTransportOptions = {}) {
    this.sim = new PowerStationSimulator(opts);
    this.intervalMs = opts.intervalMs ?? 1000;
    this.timeScale = opts.timeScale ?? 1;
    this.latencyMs = opts.latencyMs ?? 40;
  }

  get deviceName(): string {
    return `YIchu-${this.sim.info.deviceSn.slice(-4)}`;
  }

  get connected(): boolean {
    return this.timer !== null;
  }

  async connect(): Promise<void> {
    await delay(350);
    if (this.timer) return;
    this.timer = setInterval(() => this.step(), this.intervalMs);
    // First full snapshot shortly after notifications are enabled.
    setTimeout(() => {
      if (!this.timer) return;
      this.notify.emit(this.sim.statusFrame());
      this.notify.emit(this.sim.systemFrame());
      this.notify.emit(this.sim.batteryFrame());
    }, 250);
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Simulate an unexpected link loss (for testing reconnect UI). */
  dropLink(reason = 'Simulated link loss'): void {
    void this.disconnect();
    this.dropped.emit(reason);
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.timer) throw new Error('Not connected');
    const replies = this.sim.handleWrite(bytes);
    replies.forEach((r, i) => setTimeout(() => this.timer && this.notify.emit(r), this.latencyMs + i * 30));
  }

  onNotify(cb: (bytes: Uint8Array) => void): () => void {
    return this.notify.add(cb);
  }

  onDisconnect(cb: (reason: string) => void): () => void {
    return this.dropped.add(cb);
  }

  private step(): void {
    this.sim.tick((this.intervalMs / 1000) * this.timeScale);
    this.tickCount++;
    this.notify.emit(this.sim.systemFrame());
    if (this.tickCount % 2 === 0) this.notify.emit(this.sim.batteryFrame());
    else this.notify.emit(this.sim.statusFrame());
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
