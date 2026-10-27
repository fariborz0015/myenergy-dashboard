'use client';

import { create } from 'zustand';
import type { PowerReadings, SwitchName, SwitchStates, TimerSettings } from '@myenergy/protocol';

export type ConnStatus = 'idle' | 'requesting' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
export type ConnMode = 'ble' | 'demo' | 'watch';

export interface DeviceInfo {
  bleName: string | null;
  deviceSn: string | null;
  gatewaySn: string | null;
  modelCode: string | null;
  deptCode: string | null;
  versions: Record<string, string>;
}

export interface Telemetry {
  soc: number | null;
  tempC: number | null;
  temperaturesC: number[];
  power: PowerReadings | null;
  /** Device's own estimate (block ab word 0, assumed minutes). */
  remainUsableMin: number | null;
  switches: SwitchStates | null;
  switchBitmap: number | null;
  timersSet: TimerSettings | null;
  timersRemaining: TimerSettings | null;
  lightWorkMode: number | null;
  backlight: number | null;
  chargeLimitW: number | null;
  /** From the 53 frame (identified on a real device): state of health, current, cell voltages. */
  sohPct: number | null;
  batteryCurrentA: number | null;
  cellVoltagesV: number[];
  /** Block `ac` of the 51 frame, °C. */
  internalTempsC: number[];
  lastFrameAt: number | null;
}

export interface FrameEntry {
  id: number;
  ts: number;
  dir: 'tx' | 'rx';
  hex: string;
  type: string;
  summary: string;
  crcOk: boolean | null;
}

export interface HistoryPoint {
  ts: number;
  inW: number;
  outW: number;
  soc: number | null;
}

export interface GattCharacteristicInfo {
  uuid: string;
  properties: string[];
}

export interface GattServiceInfo {
  uuid: string;
  characteristics: GattCharacteristicInfo[];
}

export interface GattDetails {
  services: GattServiceInfo[];
  selected: { service: string; characteristic: string } | null;
}

/** What the browser could see when no usable characteristic was found. */
export interface BleDiagnostics {
  /** Services Chrome exposed (only those listed in optionalServices). */
  accessible: string[];
  /** Service UUIDs heard in the station's advertisement, if the browser supports it. */
  advertised: string[];
  /** Advertised UUIDs newly added to settings for the next attempt. */
  learned: string[];
}

export interface PendingSwitch {
  value: boolean;
  sentAt: number;
}

export const HISTORY_WINDOW_MS = 10 * 60 * 1000;
const MAX_FRAMES = 300;

export const EMPTY_TELEMETRY: Telemetry = {
  soc: null,
  tempC: null,
  temperaturesC: [],
  power: null,
  remainUsableMin: null,
  switches: null,
  switchBitmap: null,
  timersSet: null,
  timersRemaining: null,
  lightWorkMode: null,
  backlight: null,
  chargeLimitW: null,
  sohPct: null,
  batteryCurrentA: null,
  cellVoltagesV: [],
  internalTempsC: [],
  lastFrameAt: null,
};

const EMPTY_INFO: DeviceInfo = {
  bleName: null,
  deviceSn: null,
  gatewaySn: null,
  modelCode: null,
  deptCode: null,
  versions: {},
};

interface DeviceStore {
  status: ConnStatus;
  mode: ConnMode | null;
  error: string | null;
  reconnectAttempt: number;
  info: DeviceInfo;
  telemetry: Telemetry;
  pending: Partial<Record<SwitchName, PendingSwitch>>;
  history: HistoryPoint[];
  frames: FrameEntry[];
  framesPaused: boolean;
  gatt: GattDetails | null;
  session: { startedAt: number | null; whIn: number; whOut: number };
  today: { date: string; whIn: number; whOut: number };
  wifiReply: string | null;
  bleDiagnostics: BleDiagnostics | null;

  setStatus: (status: ConnStatus, error?: string | null) => void;
  setMode: (mode: ConnMode | null) => void;
  setReconnectAttempt: (n: number) => void;
  patchInfo: (patch: Partial<DeviceInfo>) => void;
  patchTelemetry: (patch: Partial<Telemetry>) => void;
  setPending: (name: SwitchName, value: boolean | null) => void;
  pushHistory: (p: HistoryPoint) => void;
  logFrame: (f: Omit<FrameEntry, 'id'>) => void;
  clearFrames: () => void;
  setFramesPaused: (paused: boolean) => void;
  setGatt: (g: GattDetails | null) => void;
  setEnergy: (session: DeviceStore['session'], today: DeviceStore['today']) => void;
  setWifiReply: (r: string | null) => void;
  setBleDiagnostics: (d: BleDiagnostics | null) => void;
  resetDevice: () => void;
}

let frameId = 0;

export const useDevice = create<DeviceStore>()((set) => ({
  status: 'idle',
  mode: null,
  error: null,
  reconnectAttempt: 0,
  info: EMPTY_INFO,
  telemetry: EMPTY_TELEMETRY,
  pending: {},
  history: [],
  frames: [],
  framesPaused: false,
  gatt: null,
  session: { startedAt: null, whIn: 0, whOut: 0 },
  today: { date: '', whIn: 0, whOut: 0 },
  wifiReply: null,
  bleDiagnostics: null,

  setStatus: (status, error = null) => set({ status, error }),
  setMode: (mode) => set({ mode }),
  setReconnectAttempt: (reconnectAttempt) => set({ reconnectAttempt }),
  patchInfo: (patch) => set((s) => ({ info: { ...s.info, ...patch, versions: { ...s.info.versions, ...(patch.versions ?? {}) } } })),
  patchTelemetry: (patch) => set((s) => ({ telemetry: { ...s.telemetry, ...patch } })),
  setPending: (name, value) =>
    set((s) => {
      const pending = { ...s.pending };
      if (value === null) delete pending[name];
      else pending[name] = { value, sentAt: Date.now() };
      return { pending };
    }),
  pushHistory: (p) =>
    set((s) => {
      const cutoff = p.ts - HISTORY_WINDOW_MS;
      const history = s.history.filter((h) => h.ts >= cutoff);
      history.push(p);
      return { history };
    }),
  logFrame: (f) =>
    set((s) => {
      if (s.framesPaused) return {};
      const frames = s.frames.length >= MAX_FRAMES ? s.frames.slice(-MAX_FRAMES + 1) : s.frames.slice();
      frames.push({ ...f, id: ++frameId });
      return { frames };
    }),
  clearFrames: () => set({ frames: [] }),
  setFramesPaused: (framesPaused) => set({ framesPaused }),
  setGatt: (gatt) => set({ gatt }),
  setEnergy: (session, today) => set({ session, today }),
  setWifiReply: (wifiReply) => set({ wifiReply }),
  setBleDiagnostics: (bleDiagnostics) => set({ bleDiagnostics }),
  resetDevice: () =>
    set({
      info: EMPTY_INFO,
      telemetry: EMPTY_TELEMETRY,
      pending: {},
      history: [],
      gatt: null,
      session: { startedAt: null, whIn: 0, whOut: 0 },
      wifiReply: null,
      bleDiagnostics: null,
    }),
}));

/** How long an optimistic switch value wins over device frames. */
export const PENDING_TTL_MS = 4000;

/** Switch states with optimistic overrides applied. */
export function effectiveSwitches(s: Pick<DeviceStore, 'telemetry' | 'pending'>, now = Date.now()): SwitchStates | null {
  const base = s.telemetry.switches;
  if (!base) return null;
  const out = { ...base };
  for (const [k, p] of Object.entries(s.pending)) {
    if (p && now - p.sentAt < PENDING_TTL_MS) (out as Record<string, boolean>)[k] = p.value;
  }
  return out;
}

export function displayName(info: DeviceInfo): string {
  if (info.bleName) return info.bleName.replace(/^YIchu[-_ :]*/i, 'INFINITY 1000 ').trim();
  if (info.deviceSn) return `INFINITY 1000 ${info.deviceSn.slice(-4)}`;
  return 'INFINITY 1000';
}
