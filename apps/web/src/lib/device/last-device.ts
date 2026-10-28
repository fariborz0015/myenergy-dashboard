'use client';

/** What to resume after a page reload. */
export interface LastDevice {
  mode: 'ble' | 'demo';
  /** `BluetoothDevice.id` (stable only with Chrome's persistent Bluetooth permissions). */
  id?: string;
  name?: string | null;
}

const KEY = 'myenergy-last-device';

export function readLastDevice(): LastDevice | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as LastDevice | null;
    return v && (v.mode === 'ble' || v.mode === 'demo') ? v : null;
  } catch {
    return null;
  }
}

export function saveLastDevice(d: LastDevice): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // ignore
  }
}

export function clearLastDevice(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** True when Chrome exposes previously-permitted devices (persistent permissions backend). */
export function canResumeSilently(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.bluetooth?.getDevices === 'function';
}
