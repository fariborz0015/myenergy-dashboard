/**
 * Byte / hex helpers. The original app works on lowercase hex strings for
 * everything it receives, so the decoder does the same and these helpers
 * mirror its semantics (e.g. `hex2ascii` stops at the first `00`).
 */

export type Bytes = Uint8Array;

export function bytesToHex(bytes: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i]! & 0xff).toString(16).padStart(2, '0');
  }
  return out;
}

export function hexToBytes(hex: string): Bytes {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0) throw new Error(`Odd-length hex string: ${hex}`);
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error(`Invalid hex string: ${hex}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

export function dataViewToHex(view: DataView): string {
  return bytesToHex(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
}

/** UTF-8 encode (the original sends SSID/password as UTF-8). */
export function utf8ToBytes(text: string): Bytes {
  return new TextEncoder().encode(text);
}

/** Decode hex to ASCII, stopping at the first NUL byte, like the app's `hex2ascii`. */
export function hexToAscii(hex: string | undefined): string {
  if (!hex) return '';
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const pair = hex.substr(i, 2);
    if (pair === '00') break;
    out += String.fromCharCode(parseInt(pair, 16));
  }
  return out;
}

export function asciiToHex(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) out += (text.charCodeAt(i) & 0xff).toString(16).padStart(2, '0');
  return out;
}

/** `0102 0a` → `1.2.10` — the app's `convertToDottedDecimal`. */
export function toDottedDecimal(hex: string | undefined): string {
  if (!hex) return '';
  const chunks = hex.match(/.{2}/g) ?? [];
  return chunks.map((c) => parseInt(c, 16)).join('.');
}

export function u16be(value: number): [number, number] {
  const v = Math.max(0, Math.min(0xffff, Math.round(value)));
  return [(v >> 8) & 0xff, v & 0xff];
}

export function i16be(value: number): [number, number] {
  const v = Math.max(-0x8000, Math.min(0x7fff, Math.round(value)));
  return u16be(v < 0 ? v + 0x10000 : v);
}

export function readU16be(bytes: ArrayLike<number>, offset: number): number {
  return (((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)) >>> 0;
}

export function readI16be(bytes: ArrayLike<number>, offset: number): number {
  const v = readU16be(bytes, offset);
  return v & 0x8000 ? v - 0x10000 : v;
}

export function concatBytes(...parts: ArrayLike<number>[]): Bytes {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Pretty-print hex in byte groups for logs: `4d 4d 00 10 …`. */
export function formatHex(hex: string): string {
  return (hex.match(/.{1,2}/g) ?? []).join(' ');
}
