import { EnergyIntegrator } from '@myenergy/protocol';

/** Numeric telemetry fields that are averaged when bucketing. */
export const POWER_FIELDS = [
  'inW',
  'outW',
  'acInW',
  'dcInW',
  'acOutW',
  'dcOutW',
  'usbAW',
  'usbCW',
  'carW',
  'wirelessW',
] as const;
export type PowerField = (typeof POWER_FIELDS)[number];

export type SampleLike = {
  /** epoch ms */
  ts: number;
  soc: number;
  tempC: number | null;
  switches: number;
  /** weight (number of raw samples represented) */
  n?: number;
} & Record<PowerField, number>;

export const BUCKETS: Record<string, number> = {
  '5s': 5,
  '10s': 10,
  '30s': 30,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '1d': 86400,
};

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Weighted average of samples grouped into fixed buckets aligned to the epoch.
 * `switches` keeps the last value of the bucket, `tempC` ignores missing readings.
 */
export function bucketize(samples: SampleLike[], bucketS: number): SampleLike[] {
  const size = bucketS * 1000;
  const groups = new Map<number, SampleLike[]>();
  for (const s of [...samples].sort((a, b) => a.ts - b.ts)) {
    const key = Math.floor(s.ts / size) * size;
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }
  const out: SampleLike[] = [];
  for (const [ts, g] of groups) {
    const weight = (s: SampleLike) => s.n ?? 1;
    const n = g.reduce((a, s) => a + weight(s), 0);
    const avg = (f: (s: SampleLike) => number) => g.reduce((a, s) => a + f(s) * weight(s), 0) / n;
    const temps = g.filter((s) => s.tempC !== null);
    const tn = temps.reduce((a, s) => a + weight(s), 0);
    const row = {
      ts,
      n,
      soc: round(avg((s) => s.soc)),
      tempC: tn ? round(temps.reduce((a, s) => a + (s.tempC as number) * weight(s), 0) / tn) : null,
      switches: g[g.length - 1]!.switches,
    } as SampleLike;
    for (const f of POWER_FIELDS) row[f] = round(avg((s) => s[f]));
    out.push(row);
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/** Merge a stored bucket with a freshly averaged one (weighted by sample count). */
export function mergeBuckets(stored: SampleLike, incoming: SampleLike): SampleLike {
  const merged = bucketize([stored, { ...incoming, ts: stored.ts }], Number.MAX_SAFE_INTEGER)[0]!;
  return { ...merged, ts: stored.ts, switches: incoming.switches };
}

/** Pick a bucket so that a range never returns more than `maxPoints` points. */
export function chooseBucket(requested: string | undefined, fromMs: number, toMs: number, maxPoints = 2000): string {
  const spanS = Math.max(1, (toMs - fromMs) / 1000);
  const ordered = Object.entries(BUCKETS).sort((a, b) => a[1] - b[1]);
  const wanted = requested && BUCKETS[requested] ? BUCKETS[requested] : undefined;
  for (const [name, s] of ordered) {
    if (wanted !== undefined && s < wanted) continue;
    if (spanS / s <= maxPoints) return name;
  }
  return '1d';
}

export interface RangeSummary {
  whIn: number;
  whOut: number;
  socStart: number | null;
  socEnd: number | null;
  peakInW: number;
  peakOutW: number;
  avgTempC: number | null;
}

export function summarize(samples: SampleLike[], maxGapS: number): RangeSummary {
  const sorted = [...samples].sort((a, b) => a.ts - b.ts);
  const integ = new EnergyIntegrator(maxGapS * 1000);
  for (const s of sorted) integ.add(s.ts, s.inW, s.outW);
  const temps = sorted.filter((s) => s.tempC !== null).map((s) => s.tempC as number);
  return {
    whIn: round(integ.whIn, 2),
    whOut: round(integ.whOut, 2),
    socStart: sorted[0]?.soc ?? null,
    socEnd: sorted[sorted.length - 1]?.soc ?? null,
    peakInW: sorted.reduce((m, s) => Math.max(m, s.inW), 0),
    peakOutW: sorted.reduce((m, s) => Math.max(m, s.outW), 0),
    avgTempC: temps.length ? round(temps.reduce((a, b) => a + b, 0) / temps.length) : null,
  };
}
