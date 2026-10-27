import { bytesToHex, concatBytes, readU16be, type Bytes } from './hex';

/**
 * Splits / re-joins notifications into whole frames.
 *
 * The original app relies on MTU 500 and treats each notification as one frame. Web
 * Bluetooth cannot request an MTU, so on links with a small MTU a long `51`/`53` frame may
 * arrive in several notifications (or several frames in one). Binary frames carry their
 * payload length, so we can reassemble them: total = 7 header bytes + len + 2 CRC bytes.
 * ASCII replies (`YI…`) carry no length and are passed through as-is.
 */
export class FrameAssembler {
  private buffer: Bytes = new Uint8Array(0);
  private bufferedAt = 0;

  constructor(
    private readonly onFrame: (hex: string) => void,
    private readonly staleMs = 500,
    private readonly now: () => number = () => Date.now(),
  ) {}

  push(chunk: ArrayLike<number>): void {
    const bytes = Uint8Array.from(chunk);
    if (this.buffer.length && this.now() - this.bufferedAt > this.staleMs) this.flush();
    // A new frame header while something is buffered means the previous frame was truncated.
    if (this.buffer.length && isFrameStart(bytes)) this.flush();
    this.buffer = this.buffer.length ? concatBytes(this.buffer, bytes) : bytes;
    this.bufferedAt = this.now();
    this.drain();
  }

  /** Emit whatever is buffered (e.g. after a timeout). */
  flush(): void {
    if (this.buffer.length) this.onFrame(bytesToHex(this.buffer));
    this.buffer = new Uint8Array(0);
  }

  private drain(): void {
    while (this.buffer.length) {
      const b = this.buffer;
      if (b[0] === 0x57 && b[1] === 0x4c) {
        if (b.length < 7) return; // wait for the header
        const total = 7 + readU16be(b, 5) + 2;
        if (b.length < total) return; // wait for the rest
        this.onFrame(bytesToHex(b.subarray(0, total)));
        this.buffer = b.slice(total);
        continue;
      }
      // ASCII or unknown: emit the whole chunk.
      this.onFrame(bytesToHex(b));
      this.buffer = new Uint8Array(0);
    }
  }
}

function isFrameStart(b: Bytes): boolean {
  return (b[0] === 0x57 && b[1] === 0x4c) || (b[0] === 0x59 && b[1] === 0x49);
}
