/**
 * Modbus CRC-16 (reflected poly 0xA001, init 0xFFFF). Frames carry it low byte first,
 * which is what the app's `ToModbusCRC16` table implementation produces.
 */
export function crc16Modbus(bytes: ArrayLike<number>, start = 0, end = bytes.length): number {
  let crc = 0xffff;
  for (let i = start; i < end; i++) {
    crc ^= bytes[i]! & 0xff;
    for (let b = 0; b < 8; b++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc & 0xffff;
}

/** CRC as the two bytes appended to a frame (low byte first). */
export function crcBytes(bytes: ArrayLike<number>): [number, number] {
  const crc = crc16Modbus(bytes);
  return [crc & 0xff, (crc >> 8) & 0xff];
}
