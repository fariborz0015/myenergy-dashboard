import { crcBytes } from './crc';
import { concatBytes, u16be, utf8ToBytes, type Bytes } from './hex';
import {
  CHARGE_LIMIT_TAG,
  Cmd,
  DisplayTag,
  SwitchTag,
  TimerTag,
  type SwitchName,
  type TimerName,
} from './types';

/** Request header: `MM` + two constant bytes the app always sends (meaning unknown). */
export const REQUEST_HEADER = [0x4d, 0x4d, 0x00, 0x10] as const;

/** Build `4D4D 0010 <cmd> <len:u16be> <payload> <crc:lo,hi>`. */
export function buildRequest(cmd: number, payload: ArrayLike<number> = []): Bytes {
  const body = concatBytes(REQUEST_HEADER, [cmd & 0xff], u16be(payload.length), payload);
  return concatBytes(body, crcBytes(body));
}

export const commands = {
  queryVersions: (): Bytes => buildRequest(Cmd.Versions),
  queryModelInfo: (): Bytes => buildRequest(Cmd.ModelInfo),
  setSwitch: (name: SwitchName, on: boolean): Bytes =>
    buildRequest(Cmd.SetSwitch, [SwitchTag[name], on ? 1 : 0]),
  /** `value` is in the timer's native unit (see `TIMER_UNITS`). */
  setTimer: (name: TimerName, value: number): Bytes =>
    buildRequest(Cmd.SetTimer, [TimerTag[name], ...u16be(value)]),
  setChargeLimit: (watts: number): Bytes =>
    buildRequest(Cmd.SetChargeLimit, [CHARGE_LIMIT_TAG, ...u16be(watts)]),
  setLightMode: (mode: number): Bytes =>
    buildRequest(Cmd.SetDisplay, [DisplayTag.lightMode, mode & 0xff]),
  setBacklight: (level: number): Bytes =>
    buildRequest(Cmd.SetDisplay, [DisplayTag.backlight, level & 0xff]),
};

/** ASCII commands. Sent as raw ASCII/UTF-8 bytes; terminators match the original exactly. */
export const asciiCommands = {
  querySn: (): Bytes => utf8ToBytes('YICHU|SN|?\r\n'),
  queryVersion: (): Bytes => utf8ToBytes('YICHU|VER?'),
  queryWifi: (): Bytes => utf8ToBytes('YICHU|WIFI|?\r\n'),
  /** The password travels in plaintext over BLE — the protocol has no encryption. */
  setWifi: (ssid: string, password: string): Bytes =>
    utf8ToBytes(`YICHU|WIFI|${ssid}|${password}\r\n`),
  resetWifi: (): Bytes => utf8ToBytes('YICHU|WIFI_RESET'),
  clearWifi: (): Bytes => utf8ToBytes('YICHU|WIFI_CTL|CLEAN'),
};

export interface ScheduledWrite {
  /** Delay from the start of the sequence, in ms. */
  at: number;
  bytes: Bytes;
  label: string;
}

/** The "query common info" sequence sent right after connecting, with the app's timing. */
export function connectSequence(): ScheduledWrite[] {
  return [
    { at: 100, bytes: asciiCommands.querySn(), label: 'YICHU|SN|?' },
    { at: 300, bytes: asciiCommands.queryVersion(), label: 'YICHU|VER?' },
    { at: 500, bytes: commands.queryVersions(), label: '0C versions' },
    { at: 700, bytes: commands.queryModelInfo(), label: '0A model info' },
  ];
}

/**
 * WiFi provisioning with the app's timing (`submitComfig`): credentials, reset at +500 ms,
 * WiFi switch off at +1500 ms and back on 300 ms later.
 */
export function wifiProvisionSequence(ssid: string, password: string): ScheduledWrite[] {
  return [
    { at: 0, bytes: asciiCommands.setWifi(ssid, password), label: 'YICHU|WIFI|…' },
    { at: 500, bytes: asciiCommands.resetWifi(), label: 'YICHU|WIFI_RESET' },
    { at: 1500, bytes: commands.setSwitch('wifi', false), label: 'WiFi off' },
    { at: 1800, bytes: commands.setSwitch('wifi', true), label: 'WiFi on' },
  ];
}
