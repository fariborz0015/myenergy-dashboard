'use client';

import { Listeners, type DeviceTransport } from '@myenergy/protocol';
import type { GattDetails, GattServiceInfo } from '@/lib/store/device-store';

/**
 * Web Bluetooth only lets a page touch services listed in `optionalServices`, and the
 * original app never hard-codes a UUID (it takes the first characteristic with
 * read+write+notify). So we ask for a broad set of vendor/UART services that serial-over-BLE
 * modules commonly use, plus whatever the user typed into settings.
 */
export const CANDIDATE_SERVICES: BluetoothServiceUUID[] = [
  0xfff0,
  0xffe0,
  0xffe5,
  0xff00,
  0xff10,
  0xffd0,
  0xae00,
  0xfee7,
  0x1800,
  0x1801,
  0x180a,
  0x180f,
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
];

export const NAME_PREFIX = 'YIchu';

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator && !!navigator.bluetooth;
}

export interface WebBluetoothOptions {
  acceptAllDevices?: boolean;
  extraServices?: BluetoothServiceUUID[];
  /** Force a specific characteristic instead of auto-selecting. */
  preferred?: { service: string; characteristic: string } | null;
  onPhase?: (phase: 'requesting' | 'connecting' | 'discovering') => void;
}

function props(c: BluetoothRemoteGATTCharacteristic): string[] {
  const p = c.properties;
  return (
    [
      ['read', p.read],
      ['write', p.write],
      ['writeWithoutResponse', p.writeWithoutResponse],
      ['notify', p.notify],
      ['indicate', p.indicate],
    ] as const
  )
    .filter(([, v]) => v)
    .map(([k]) => k);
}

export class WebBluetoothTransport implements DeviceTransport {
  readonly kind = 'ble' as const;
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private all: { service: string; char: BluetoothRemoteGATTCharacteristic }[] = [];
  private readonly notify = new Listeners<[Uint8Array]>();
  private readonly dropped = new Listeners<[string]>();
  private manualDisconnect = false;
  details: GattDetails | null = null;

  constructor(private readonly opts: WebBluetoothOptions = {}) {}

  get deviceName(): string | null {
    return this.device?.name ?? null;
  }

  async connect(): Promise<void> {
    if (!isWebBluetoothAvailable()) throw new Error('Web Bluetooth is not available in this browser');
    this.manualDisconnect = false;
    if (!this.device) {
      this.opts.onPhase?.('requesting');
      const optionalServices = [...CANDIDATE_SERVICES, ...(this.opts.extraServices ?? [])];
      this.device = await navigator.bluetooth.requestDevice(
        this.opts.acceptAllDevices
          ? { acceptAllDevices: true, optionalServices }
          : { filters: [{ namePrefix: NAME_PREFIX }], optionalServices },
      );
      this.device.addEventListener('gattserverdisconnected', this.onGattDisconnected);
    }
    this.opts.onPhase?.('connecting');
    const server = await this.device.gatt!.connect();
    this.opts.onPhase?.('discovering');
    await this.discover(server);
    const chosen = this.pick();
    if (!chosen) {
      throw new Error(
        'No characteristic with write + notify found in the accessible services. Add your device’s service UUID in Settings → Connection.',
      );
    }
    await this.use(chosen);
  }

  private async discover(server: BluetoothRemoteGATTServer): Promise<void> {
    let services: BluetoothRemoteGATTService[] = [];
    try {
      services = await server.getPrimaryServices();
    } catch {
      services = [];
    }
    const infos: GattServiceInfo[] = [];
    this.all = [];
    for (const s of services) {
      let chars: BluetoothRemoteGATTCharacteristic[] = [];
      try {
        chars = await s.getCharacteristics();
      } catch {
        chars = [];
      }
      infos.push({ uuid: s.uuid, characteristics: chars.map((c) => ({ uuid: c.uuid, properties: props(c) })) });
      for (const c of chars) this.all.push({ service: s.uuid, char: c });
    }
    this.details = { services: infos, selected: null };
  }

  /** Same rule as the app: first characteristic with read && write && notify; then looser fallbacks. */
  private pick(): BluetoothRemoteGATTCharacteristic | null {
    const pref = this.opts.preferred;
    if (pref) {
      const hit = this.all.find((x) => x.service === pref.service && x.char.uuid === pref.characteristic);
      if (hit) return hit.char;
    }
    const p = (c: BluetoothRemoteGATTCharacteristic) => c.properties;
    return (
      this.all.find((x) => p(x.char).read && p(x.char).write && p(x.char).notify)?.char ??
      this.all.find((x) => p(x.char).write && p(x.char).notify)?.char ??
      this.all.find((x) => (p(x.char).write || p(x.char).writeWithoutResponse) && (p(x.char).notify || p(x.char).indicate))?.char ??
      null
    );
  }

  private async use(c: BluetoothRemoteGATTCharacteristic): Promise<void> {
    if (this.characteristic && this.characteristic !== c) {
      this.characteristic.removeEventListener('characteristicvaluechanged', this.onValue);
      try {
        await this.characteristic.stopNotifications();
      } catch {
        // ignore
      }
    }
    this.characteristic = c;
    c.addEventListener('characteristicvaluechanged', this.onValue);
    await c.startNotifications();
    if (this.details) this.details.selected = { service: c.service.uuid, characteristic: c.uuid };
  }

  /** Manually switch to another characteristic (from the Connection details panel). */
  async select(service: string, characteristic: string): Promise<void> {
    const hit = this.all.find((x) => x.service === service && x.char.uuid === characteristic);
    if (!hit) throw new Error('Characteristic not found');
    await this.use(hit.char);
  }

  async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.onValue);
    this.characteristic = null;
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
  }

  /** Forget the chosen device (next connect shows the chooser again). */
  forget(): void {
    this.device?.removeEventListener('gattserverdisconnected', this.onGattDisconnected);
    this.device = null;
  }

  async write(bytes: Uint8Array): Promise<void> {
    const c = this.characteristic;
    if (!c || !this.device?.gatt?.connected) throw new Error('Not connected');
    // The original app uses writeType "write" (with response) and never fragments.
    const buf = new Uint8Array(bytes).buffer as ArrayBuffer;
    if (c.properties.write) await c.writeValueWithResponse(buf);
    else await c.writeValueWithoutResponse(buf);
  }

  onNotify(cb: (bytes: Uint8Array) => void): () => void {
    return this.notify.add(cb);
  }

  onDisconnect(cb: (reason: string) => void): () => void {
    return this.dropped.add(cb);
  }

  private onValue = (e: Event) => {
    const v = (e.target as BluetoothRemoteGATTCharacteristic).value;
    if (v) this.notify.emit(new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)));
  };

  private onGattDisconnected = () => {
    this.characteristic = null;
    if (!this.manualDisconnect) this.dropped.emit('GATT server disconnected');
  };
}
