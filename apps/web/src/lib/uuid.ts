/** Normalise a user-entered UUID for `optionalServices`. Returns null if invalid. */
export function normalizeServiceUuid(input: string): string | number | null {
  const v = input.trim().toLowerCase().replace(/^0x/, '');
  if (!v) return null;
  if (/^[0-9a-f]{4}$/.test(v)) return parseInt(v, 16);
  if (/^[0-9a-f]{8}$/.test(v)) return `${v}-0000-1000-8000-00805f9b34fb`;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) return v;
  return null;
}

const split = (list: string) => list.split(/[\s,;]+/).filter(Boolean);

/** Comma/space-separated list of UUIDs → values for `optionalServices` (invalid ones dropped). */
export function parseServiceUuids(list: string): (string | number)[] {
  return split(list)
    .map(normalizeServiceUuid)
    .filter((u): u is string | number => u !== null);
}

export function isValidServiceUuidList(list: string): boolean {
  return split(list).every((u) => normalizeServiceUuid(u) !== null);
}

/** Comparable short form: 16-bit Bluetooth-base UUIDs as `fff0`, others as lowercase 128-bit. */
export function uuidKey(input: string | number): string {
  if (typeof input === 'number') return input.toString(16).padStart(4, '0');
  const m = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i.exec(input);
  return m ? m[1]!.toLowerCase() : input.toLowerCase();
}
