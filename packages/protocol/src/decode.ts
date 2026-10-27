import { crc16Modbus } from './crc';
import { bytesToHex, hexToAscii, hexToBytes, readI16be, toDottedDecimal } from './hex';
import {
  Cmd,
  StatusBit,
  type AsciiSnReply,
  type AsciiVerReply,
  type BatteryData,
  type ModelInfo,
  type PowerReadings,
  type SwitchStates,
  type SystemData,
  type TimerSettings,
  type VersionInfo,
} from './types';

export const ASCII_PREFIX_HEX = '5949'; // "YI"
export const RESPONSE_PREFIX_HEX = '574c'; // "WL"

/** Parse `<tag:1B><len:1B><value>` sequences (the app's `parseStringToObject`). */
export function parseTlv(hex: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= hex.length) {
    const tag = hex.substr(i, 2).toLowerCase();
    const len = parseInt(hex.substr(i + 2, 2), 16) * 2;
    i += 4;
    if (i + len > hex.length) break;
    out[tag] = hex.substr(i, len);
    i += len;
  }
  return out;
}

function words(hex: string): number[] {
  return (hex.match(/.{1,4}/g) ?? []).map((w) => parseInt(w, 16));
}

// ---------------------------------------------------------------- ASCII layer

export function parseAsciiReply(text: string):
  | { kind: 'sn'; data: AsciiSnReply }
  | { kind: 'ver'; data: AsciiVerReply }
  | { kind: 'wifi'; fields: string[] }
  | { kind: 'other'; fields: string[] } {
  const clean = text.replace('?', '').replace(/\r?\n/g, '').replace(/\r/g, '');
  const f = clean.split('|');
  if (f[1] === 'SN') {
    const data: AsciiSnReply = { gatewaySn: f[2] ?? '' };
    if (f[3]) data.deviceSn = f[3];
    if (f[4]) data.deptCode = f[4];
    if (f[5]) data.deviceModelCode = f[5];
    return { kind: 'sn', data };
  }
  if (f[1] === 'VER' && f.length > 6) {
    return {
      kind: 'ver',
      data: {
        softwareVersion: toDottedDecimal(f[2]),
        hdMainControlVersion: toDottedDecimal(f[3]),
        hdInverterDcVersion: toDottedDecimal(f[4]),
        hdInverterAcVersion: toDottedDecimal(f[5]),
        hdBmsVersion: toDottedDecimal(f[6]),
      },
    };
  }
  if (f[1]?.startsWith('WIFI')) return { kind: 'wifi', fields: f };
  return { kind: 'other', fields: f };
}

// ---------------------------------------------------------------- binary payload parsers

/** cmd 0x0C: TLV versions + ASCII serial after the `fa` tag. */
export function parseVersions(payloadHex: string): VersionInfo {
  const t = parseTlv(payloadHex);
  let sn = t['fa'] !== undefined ? hexToAscii(t['fa']) : '';
  if (!sn) {
    // Fallback to the app's exact string-split approach.
    const parts = payloadHex.split('fa');
    if (parts.length > 1) sn = hexToAscii((parts[1] ?? '').slice(2));
  }
  const info: VersionInfo = {
    mainControlVersion: toDottedDecimal(t['ab']),
    inverterDcVersion: toDottedDecimal(t['ac']),
    inverterAcVersion: toDottedDecimal(t['ad']),
    bmsVersion: toDottedDecimal(t['ae']),
    hdMainControlVersion: toDottedDecimal(t['bb']),
    hdInverterDcVersion: toDottedDecimal(t['bc']),
    hdInverterAcVersion: toDottedDecimal(t['bd']),
    hdBmsVersion: toDottedDecimal(t['be']),
  };
  if (sn) info.deviceSn = sn;
  return info;
}

/** cmd 0x0A: TLV `aa` = deptCode, `ab` = deviceModelCode (ASCII). */
export function parseModelInfo(payloadHex: string): ModelInfo {
  const t = parseTlv(payloadHex);
  const clean = (s: string) => s.replace('\n', '').replace('\f', '').trim();
  return { deptCode: clean(hexToAscii(t['aa'])), deviceModelCode: clean(hexToAscii(t['ab'])) };
}

/** cmd 0x50: whole payload is one integer bitmap. */
export function parseStatus(payloadHex: string): { bitmap: number; switches: SwitchStates } {
  const bitmap = payloadHex ? parseInt(payloadHex, 16) || 0 : 0;
  const bit = (n: number) => ((bitmap >> n) & 1) === 1;
  const switches = Object.fromEntries(
    Object.entries(StatusBit).map(([k, b]) => [k, bit(b)]),
  ) as unknown as SwitchStates;
  return { bitmap, switches };
}

export function switchesToBitmap(s: SwitchStates): number {
  let bitmap = 0;
  for (const [k, b] of Object.entries(StatusBit)) {
    if (s[k as keyof SwitchStates]) bitmap |= 1 << b;
  }
  return bitmap;
}

/**
 * cmd 0x51: blocks `<tag:1B><len:1B><value>`. The app reads the length byte as a
 * byte count (`2 * len` hex chars) and splits the value into u16 BE words.
 */
export function parseSystem(payloadHex: string): SystemData {
  const blocks = parseTlv(payloadHex);
  const out: SystemData = { blocks };
  const aa = blocks['aa'];
  if (aa !== undefined) {
    const w = words(aa);
    const at = (i: number) => w[i] ?? 0;
    const usbCPortsW = w.slice(12);
    const power: PowerReadings = {
      inputW: at(0),
      acInputW: at(1),
      dcInputW: at(2),
      outputW: at(4),
      acOutputW: at(5),
      dcOutputW: at(6),
      carW: at(7),
      wirelessW: at(9),
      usbAW: at(10),
      usbCW: usbCPortsW.reduce((a, b) => a + b, 0),
      usbCPortsW,
    };
    out.power = power;
  }
  const ab = blocks['ab'];
  if (ab !== undefined) {
    const w = words(ab);
    const at = (i: number) => w[i] ?? 0;
    const timers = (o: number): TimerSettings => ({
      autoShutdown: at(o),
      screenOff: at(o + 1),
      dcAutoOff: at(o + 2),
      acAutoOff: at(o + 3),
      usbAutoOff: at(o + 4),
    });
    out.remainUsableTime = at(0);
    out.timersSet = timers(3);
    out.timersRemaining = timers(8);
  }
  const ba = blocks['ba'];
  if (ba !== undefined) {
    // value bytes: [0] unknown, [1] light mode, [2] backlight, [3..4] charge power u16
    if (ba.length >= 4) out.lightWorkMode = parseInt(ba.substr(2, 2), 16);
    if (ba.length >= 6) out.backlight = parseInt(ba.substr(4, 2), 16);
    if (ba.length >= 10) out.chargingPowerSetting = parseInt(ba.substr(6, 4), 16);
  }
  return out;
}

/** cmd 0x53: byte 0 = SOC, byte 29 = sensor count N, then N × i16 BE (0.1 °C). */
export function parseBattery(payloadHex: string): BatteryData {
  const bytes = hexToBytes(payloadHex.length % 2 ? payloadHex.slice(0, -1) : payloadHex);
  const soc = bytes[0] ?? 0;
  const n = bytes[29] || 1;
  const temperaturesC: number[] = [];
  for (let i = 0; i < n; i++) {
    const off = 30 + i * 2;
    if (off + 1 >= bytes.length) break;
    temperaturesC.push(readI16be(bytes, off) / 10);
  }
  const tempC = temperaturesC.length
    ? Math.round((temperaturesC.reduce((a, b) => a + b, 0) / temperaturesC.length) * 10) / 10
    : null;
  return { soc, tempC, temperaturesC };
}

// ---------------------------------------------------------------- frame level

export interface BinaryFrame {
  cmd: number;
  /** Bytes 2-3 of the response header, meaning unknown. */
  headerHex: string;
  declaredLength: number;
  payloadHex: string;
  /** CRC-16/Modbus over every byte before the CRC, low byte first. `null` if too short. */
  crcOk: boolean | null;
}

export type DecodedFrame =
  | { type: 'ascii'; hex: string; text: string; reply: ReturnType<typeof parseAsciiReply> }
  | { type: 'versions'; hex: string; frame: BinaryFrame; data: VersionInfo }
  | { type: 'model'; hex: string; frame: BinaryFrame; data: ModelInfo }
  | { type: 'status'; hex: string; frame: BinaryFrame; data: SwitchStates; bitmap: number }
  | { type: 'system'; hex: string; frame: BinaryFrame; data: SystemData }
  | { type: 'battery'; hex: string; frame: BinaryFrame; data: BatteryData }
  | { type: 'ack'; hex: string; frame: BinaryFrame; success: boolean }
  | { type: 'binary'; hex: string; frame: BinaryFrame }
  | { type: 'unknown'; hex: string };

export function parseBinaryFrame(hexIn: string): BinaryFrame | null {
  const hex = hexIn.toLowerCase();
  if (!hex.startsWith(RESPONSE_PREFIX_HEX) || hex.length < 14) return null;
  const cmd = parseInt(hex.slice(8, 10), 16);
  const declaredLength = parseInt(hex.slice(10, 14), 16);
  const payloadHex = hex.length >= 18 ? hex.slice(14, hex.length - 4) : '';
  let crcOk: boolean | null = null;
  if (hex.length >= 18 && hex.length % 2 === 0) {
    const bytes = hexToBytes(hex);
    const crc = crc16Modbus(bytes, 0, bytes.length - 2);
    crcOk = bytes[bytes.length - 2] === (crc & 0xff) && bytes[bytes.length - 1] === crc >> 8;
  }
  return { cmd, headerHex: hex.slice(4, 8), declaredLength, payloadHex, crcOk };
}

/** Decode one notification (hex string or bytes) into a typed frame. */
export function decodeFrame(input: string | ArrayLike<number>): DecodedFrame {
  const hex = (typeof input === 'string' ? input : bytesToHex(input)).toLowerCase();
  if (hex.startsWith(ASCII_PREFIX_HEX)) {
    let text = '';
    for (let i = 0; i + 1 < hex.length; i += 2) text += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return { type: 'ascii', hex, text, reply: parseAsciiReply(text) };
  }
  const frame = parseBinaryFrame(hex);
  if (!frame) return { type: 'unknown', hex };
  const p = frame.payloadHex;
  switch (frame.cmd) {
    case Cmd.Versions:
      return { type: 'versions', hex, frame, data: parseVersions(p) };
    case Cmd.ModelInfo:
      return { type: 'model', hex, frame, data: parseModelInfo(p) };
    case Cmd.Status: {
      const { bitmap, switches } = parseStatus(p);
      return { type: 'status', hex, frame, data: switches, bitmap };
    }
    case Cmd.System:
      return { type: 'system', hex, frame, data: parseSystem(p) };
    case Cmd.Battery:
      return { type: 'battery', hex, frame, data: parseBattery(p) };
    case Cmd.SetSwitch:
    case Cmd.SetTimer:
    case Cmd.SetChargeLimit:
    case Cmd.SetDisplay:
      return { type: 'ack', hex, frame, success: p.slice(0, 2) === '00' };
    default:
      return { type: 'binary', hex, frame };
  }
}

/** One-line human summary for the raw frame console. */
export function summarizeFrame(f: DecodedFrame): string {
  switch (f.type) {
    case 'ascii':
      return `ASCII ${f.text.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}`;
    case 'versions':
      return `0C versions sn=${f.data.deviceSn ?? '?'} main=${f.data.mainControlVersion} bms=${f.data.bmsVersion}`;
    case 'model':
      return `0A model=${f.data.deviceModelCode} dept=${f.data.deptCode}`;
    case 'status': {
      const on = Object.entries(f.data)
        .filter(([, v]) => v)
        .map(([k]) => k);
      return `50 status 0x${f.bitmap.toString(16)} [${on.join(', ') || 'all off'}]`;
    }
    case 'system': {
      const p = f.data.power;
      return p
        ? `51 in=${p.inputW}W out=${p.outputW}W ac=${p.acOutputW}W dc=${p.dcOutputW}W usb=${p.usbAW + p.usbCW}W remain=${f.data.remainUsableTime ?? '?'}`
        : '51 system';
    }
    case 'battery':
      return `53 soc=${f.data.soc}% temp=${f.data.tempC ?? '?'}°C`;
    case 'ack':
      return `${f.frame.cmd.toString(16).padStart(2, '0').toUpperCase()} ack ${f.success ? 'OK' : 'FAIL'}`;
    case 'binary':
      return `cmd 0x${f.frame.cmd.toString(16)} (${f.frame.declaredLength} B)`;
    default:
      return 'unknown';
  }
}
