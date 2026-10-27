import { bucketize, chooseBucket, mergeBuckets, summarize, type SampleLike } from './downsample';

const sample = (ts: number, inW: number, outW: number, extra: Partial<SampleLike> = {}): SampleLike => ({
  ts,
  soc: 50,
  tempC: 25,
  switches: 0,
  inW,
  outW,
  acInW: 0,
  dcInW: inW,
  acOutW: outW,
  dcOutW: 0,
  usbAW: 0,
  usbCW: 0,
  carW: 0,
  wirelessW: 0,
  ...extra,
});

describe('bucketize', () => {
  it('averages samples into epoch-aligned buckets', () => {
    const rows = [0, 1, 2, 3, 4, 5, 6].map((s) => sample(s * 1000, s * 10, 100));
    const out = bucketize(rows, 5);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ ts: 0, n: 5, inW: 20, outW: 100 });
    expect(out[1]).toMatchObject({ ts: 5000, n: 2, inW: 55 });
  });

  it('keeps the last switch bitmap and ignores missing temperatures', () => {
    const out = bucketize(
      [sample(0, 0, 0, { switches: 2, tempC: null }), sample(1000, 0, 0, { switches: 6, tempC: 30 })],
      60,
    );
    expect(out[0]).toMatchObject({ switches: 6, tempC: 30 });
  });

  it('weights by n', () => {
    const out = bucketize([sample(0, 100, 0, { n: 3 }), sample(1000, 0, 0, { n: 1 })], 60);
    expect(out[0]!.inW).toBe(75);
    expect(out[0]!.n).toBe(4);
  });
});

describe('mergeBuckets', () => {
  it('merges a stored bucket with a new partial one', () => {
    const merged = mergeBuckets(sample(5000, 100, 0, { n: 2 }), sample(5000, 40, 0, { n: 3, switches: 9 }));
    expect(merged).toMatchObject({ ts: 5000, n: 5, inW: 64, switches: 9 });
  });
});

describe('chooseBucket', () => {
  it('keeps the requested bucket when the range is small enough', () => {
    expect(chooseBucket('1m', 0, 24 * 3600 * 1000)).toBe('1m');
  });
  it('coarsens buckets for long ranges', () => {
    expect(chooseBucket('10s', 0, 30 * 24 * 3600 * 1000)).toBe('1h');
  });
  it('ignores unknown buckets and picks the finest that fits', () => {
    expect(chooseBucket('7m', 0, 3600 * 1000)).toBe('5s');
  });
});

describe('summarize', () => {
  it('integrates energy and reports extremes', () => {
    const rows = Array.from({ length: 721 }, (_, i) => sample(i * 5000, 360, 180, { soc: 40 + i / 72 }));
    const s = summarize(rows, 30);
    expect(s.whIn).toBeCloseTo(360, 1);
    expect(s.whOut).toBeCloseTo(180, 1);
    expect(s.socStart).toBe(40);
    expect(s.socEnd).toBe(50);
    expect(s.peakInW).toBe(360);
    expect(s.avgTempC).toBe(25);
  });
});
