/** Normalise a user-entered UUID for `optionalServices`. Returns null if invalid. */
export function normalizeServiceUuid(input: string): string | number | null {
  const v = input.trim().toLowerCase().replace(/^0x/, '');
  if (!v) return null;
  if (/^[0-9a-f]{4}$/.test(v)) return parseInt(v, 16);
  if (/^[0-9a-f]{8}$/.test(v)) return `${v}-0000-1000-8000-00805f9b34fb`;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) return v;
  return null;
}
