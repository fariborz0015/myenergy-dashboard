/**
 * Encoders for *device → app* frames. Used by the simulator and by tests to build
 * fixtures from the documented layout. Real devices produce these; the app never sends them.
 */
import { crcBytes } from './crc';
import { concatBytes, i16be, u16be, utf8ToBytes, type Bytes } from './hex';
import { switchesToBitmap } from './decode';
import {
  Cmd,
  type PowerReadings,
  type SwitchStates,
  type TimerSettings,
  type VersionInfo,
} from './types';

/** `WL` + two unknown bytes. The simulator echoes the request's `00 10`. */
export const RESPONSE_HEADER = [0x57, 0x4c, 0x00, 0x10] as const;

export function buildResponse(cmd: number, payload: ArrayLike<number> = []): Bytes {
  const body = concatBytes(RESPONSE_HEADER, [cmd & 0xff], u16be(payload.length), payload);
  return concatBytes(body, crcBytes(body));
}

function tlv(tag: number, value: ArrayLike<number>): Bytes {
  return concatBytes([tag, value.length], value);
}

function versionBytes(dotted: string | undefined): number[] {
  return (dotted ?? '0.0.0').split('.').map((n) => Number(n) & 0xff);
}

function wordsBytes(values: number[]): Bytes {
  return concatBytes(...values.map((v) => u16be(v)));
}

export function encodeVersions(v: VersionInfo & { deviceSn: string }): Bytes {
  return buildResponse(
    Cmd.Versions,
    concatBytes(
      tlv(0xab, versionBytes(v.mainControlVersion)),
      tlv(0xac, versionBytes(v.inverterDcVersion)),
      tlv(0xad, versionBytes(v.inverterAcVersion)),
      tlv(0xae, versionBytes(v.bmsVersion)),
      tlv(0xbb, versionBytes(v.hdMainControlVersion)),
      tlv(0xbc, versionBytes(v.hdInverterDcVersion)),
      tlv(0xbd, versionBytes(v.hdInverterAcVersion)),
      tlv(0xbe, versionBytes(v.hdBmsVersion)),
      tlv(0xfa, utf8ToBytes(v.deviceSn)),
    ),
  );
}

export function encodeModelInfo(deptCode: string, deviceModelCode: string): Bytes {
  return buildResponse(
    Cmd.ModelInfo,
    concatBytes(tlv(0xaa, utf8ToBytes(deptCode)), tlv(0xab, utf8ToBytes(deviceModelCode))),
  );
}

export function encodeStatus(s: SwitchStates): Bytes {
  return buildResponse(Cmd.Status, u16be(switchesToBitmap(s)));
}

export interface SystemFrameInput {
  power: Omit<PowerReadings, 'usbCW'> & { usbCW?: number };
  remainUsableTime: number;
  timersSet: TimerSettings;
  timersRemaining: TimerSettings;
  lightWorkMode: number;
  backlight: number;
  chargingPowerSetting: number;
  /** Block `ac`, °C (encoded as words × 10). */
  internalTempsC?: number[];
}

function timerWords(t: TimerSettings): number[] {
  return [t.autoShutdown, t.screenOff, t.dcAutoOff, t.acAutoOff, t.usbAutoOff];
}

export function encodeSystem(d: SystemFrameInput): Bytes {
  const p = d.power;
  const aa = [
    p.inputW,
    p.acInputW,
    p.dcInputW,
    0,
    p.outputW,
    p.acOutputW,
    p.dcOutputW,
    p.carW,
    0,
    p.wirelessW,
    p.usbAW,
    0,
    ...p.usbCPortsW,
  ];
  const ab = [
    d.remainUsableTime,
    0,
    0,
    ...timerWords(d.timersSet),
    ...timerWords(d.timersRemaining),
  ];
  const ac = (d.internalTempsC ?? [0, 0, 0, 0]).map((t) => {
    const v = Math.round(t * 10);
    return v < 0 ? v + 0x10000 : v;
  });
  const ba = [0x00, d.lightWorkMode & 0xff, d.backlight & 0xff, ...u16be(d.chargingPowerSetting)];
  return buildResponse(
    Cmd.System,
    concatBytes(
      tlv(0xaa, wordsBytes(aa)),
      tlv(0xab, wordsBytes(ab)),
      tlv(0xac, wordsBytes(ac)),
      tlv(0xba, ba),
    ),
  );
}

export interface BatteryFrameInput {
  soc: number;
  temperaturesC: number[];
  sohPct?: number;
  /** Battery current in A (negative = discharging). */
  currentA?: number;
  cellVoltagesV?: number[];
}

/** Same layout as a real MGI032GR1HEU (53-byte payload with one temperature and one cell). */
export function encodeBattery(d: BatteryFrameInput): Bytes {
  const head = new Uint8Array(30);
  head[0] = Math.max(0, Math.min(100, Math.round(d.soc)));
  head[1] = d.sohPct ?? 100;
  head[5] = 0x01;
  const cur = Math.round((d.currentA ?? 0) * 100) | 0;
  head[6] = (cur >>> 24) & 0xff;
  head[7] = (cur >>> 16) & 0xff;
  head[8] = (cur >>> 8) & 0xff;
  head[9] = cur & 0xff;
  head[29] = d.temperaturesC.length;
  const cells = d.cellVoltagesV ?? [];
  return buildResponse(
    Cmd.Battery,
    concatBytes(
      head,
      ...d.temperaturesC.map((t) => i16be(t * 10)),
      new Uint8Array(18),
      cells.length ? [cells.length] : [],
      ...cells.map((v) => u16be(v * 1000)),
    ),
  );
}

export function encodeAck(cmd: number, success = true): Bytes {
  return buildResponse(cmd, [success ? 0x00 : 0x01]);
}
