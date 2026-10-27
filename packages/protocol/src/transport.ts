/** Anything that can carry protocol bytes to and from a power station. */
export interface DeviceTransport {
  readonly kind: 'ble' | 'demo';
  /** Human-readable device name once connected (e.g. the BLE advertised name). */
  readonly deviceName: string | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  /** Subscribe to raw notifications. Returns an unsubscribe function. */
  onNotify(cb: (bytes: Uint8Array) => void): () => void;
  /** Called when the link drops without `disconnect()` being called. */
  onDisconnect(cb: (reason: string) => void): () => void;
}

/** Tiny typed listener set used by transports. */
export class Listeners<T extends unknown[]> {
  private readonly set = new Set<(...args: T) => void>();
  add(cb: (...args: T) => void): () => void {
    this.set.add(cb);
    return () => this.set.delete(cb);
  }
  emit(...args: T): void {
    for (const cb of [...this.set]) cb(...args);
  }
  clear(): void {
    this.set.clear();
  }
}
