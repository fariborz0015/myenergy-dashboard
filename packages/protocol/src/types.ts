/** Binary command codes (request `4D4D 0010 <cmd>` / response `574C xxxx <cmd>`). */
export const Cmd = {
  /** Read serial number + firmware/hardware versions. */
  Versions: 0x0c,
  /** Read deptCode + deviceModelCode. */
  ModelInfo: 0x0a,
  /** Streamed: switch / connection status bitmap. */
  Status: 0x50,
  /** Streamed: power readings, timers, light/backlight/charge settings. */
  System: 0x51,
  /** Streamed: battery SOC + temperatures. */
  Battery: 0x53,
  /** Set a switch. */
  SetSwitch: 0x60,
  /** Set a timer. */
  SetTimer: 0x61,
  /** Set charging power limit. */
  SetChargeLimit: 0x62,
  /** Set light work mode / backlight brightness. */
  SetDisplay: 0x63,
} as const;
export type CmdCode = (typeof Cmd)[keyof typeof Cmd];

/** Payload tags for cmd 0x60. */
export const SwitchTag = {
  acOutput: 0xa0,
  dcOutput: 0xa1,
  usbOutput: 0xa2,
  acConstantPower: 0xa3,
  silentMode: 0xa4,
  keySound: 0xa5,
  wifi: 0xa6,
} as const;
export type SwitchName = keyof typeof SwitchTag;

/**
 * Payload tags for cmd 0x61. Values are u16 big-endian. The original app sends
 * **seconds** for `screenOff` (its picker multiplies minutes by 60) and **minutes**
 * for every other timer. 0 means "never".
 */
export const TimerTag = {
  autoShutdown: 0xa0,
  screenOff: 0xa1,
  dcAutoOff: 0xa2,
  acAutoOff: 0xa3,
  usbAutoOff: 0xa4,
} as const;
export type TimerName = keyof typeof TimerTag;
export const TIMER_UNITS: Record<TimerName, 'seconds' | 'minutes'> = {
  autoShutdown: 'minutes',
  screenOff: 'seconds',
  dcAutoOff: 'minutes',
  acAutoOff: 'minutes',
  usbAutoOff: 'minutes',
};

/** Payload tags for cmd 0x63. */
export const DisplayTag = {
  lightMode: 0xa0,
  backlight: 0xa1,
} as const;

/** Light work modes the app offers (value sent as u8). */
export const LightMode = {
  off: 0,
  low: 20,
  high: 40,
  sos: 60,
} as const;
export type LightModeName = keyof typeof LightMode;

/** Tag for cmd 0x62 payload. */
export const CHARGE_LIMIT_TAG = 0xa2;

export interface SwitchStates {
  acOutput: boolean;
  dcOutput: boolean;
  usbOutput: boolean;
  acChargerConnected: boolean;
  dcChargerConnected: boolean;
  acConstantPower: boolean;
  silentMode: boolean;
  keySound: boolean;
  wifi: boolean;
}

/** Bit positions in the cmd 0x50 bitmap. */
export const StatusBit: Record<keyof SwitchStates, number> = {
  acOutput: 1,
  dcOutput: 2,
  usbOutput: 3,
  acChargerConnected: 4,
  dcChargerConnected: 5,
  acConstantPower: 6,
  silentMode: 8,
  keySound: 9,
  wifi: 10,
};

export interface PowerReadings {
  inputW: number;
  acInputW: number;
  dcInputW: number;
  outputW: number;
  acOutputW: number;
  dcOutputW: number;
  carW: number;
  wirelessW: number;
  usbAW: number;
  usbCW: number;
  /** Individual USB-C port readings (words 12..). */
  usbCPortsW: number[];
}

export interface TimerSettings {
  autoShutdown: number;
  screenOff: number;
  dcAutoOff: number;
  acAutoOff: number;
  usbAutoOff: number;
}

export interface SystemData {
  power?: PowerReadings;
  /** Block `ab` word 0. Unit unverified; treated as minutes. */
  remainUsableTime?: number;
  timersSet?: TimerSettings;
  timersRemaining?: TimerSettings;
  lightWorkMode?: number;
  backlight?: number;
  chargingPowerSetting?: number;
  /** Raw TLV blocks (tag → hex) for debugging. */
  blocks: Record<string, string>;
}

export interface BatteryData {
  soc: number;
  tempC: number | null;
  temperaturesC: number[];
}

export interface VersionInfo {
  deviceSn?: string;
  mainControlVersion?: string;
  inverterDcVersion?: string;
  inverterAcVersion?: string;
  bmsVersion?: string;
  hdMainControlVersion?: string;
  hdInverterDcVersion?: string;
  hdInverterAcVersion?: string;
  hdBmsVersion?: string;
}

export interface ModelInfo {
  deptCode: string;
  deviceModelCode: string;
}

export interface AsciiSnReply {
  gatewaySn: string;
  deviceSn?: string;
  deptCode?: string;
  deviceModelCode?: string;
}

export interface AsciiVerReply {
  softwareVersion: string;
  hdMainControlVersion: string;
  hdInverterDcVersion: string;
  hdInverterAcVersion: string;
  hdBmsVersion: string;
}
