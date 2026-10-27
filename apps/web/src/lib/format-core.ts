import { splitHours } from '@myenergy/protocol';

export type Fmt = ReturnType<typeof makeFormatter>;

export function makeFormatter(
  locale: string,
  persianDigits: boolean,
  tempUnit: 'c' | 'f',
  units: { h: string; m: string; d: string; w: string; kw: string; wh: string; kwh: string },
) {
  const tag = locale === 'fa' ? (persianDigits ? 'fa-IR' : 'fa-IR-u-nu-latn') : 'en-US';
  const cache = new Map<number, Intl.NumberFormat>();
  const nf = (digits: number) => {
    let f = cache.get(digits);
    if (!f) {
      f = new Intl.NumberFormat(tag, { maximumFractionDigits: digits, minimumFractionDigits: digits });
      cache.set(digits, f);
    }
    return f;
  };
  const num = (v: number | null | undefined, digits = 0) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : nf(digits).format(v));
  const pctSign = locale === 'fa' ? '٪' : '%';
  return {
    tag,
    num,
    pctSign,
    watts: (v: number | null | undefined) =>
      v === null || v === undefined ? '—' : Math.abs(v) >= 10000 ? `${num(v / 1000, 1)} ${units.kw}` : `${num(v)} ${units.w}`,
    energy: (wh: number | null | undefined) =>
      wh === null || wh === undefined ? '—' : Math.abs(wh) >= 1000 ? `${num(wh / 1000, 2)} ${units.kwh}` : `${num(wh, wh < 10 ? 1 : 0)} ${units.wh}`,
    pct: (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${num(v)}${pctSign}`),
    temp: (c: number | null | undefined) =>
      c === null || c === undefined ? '—' : tempUnit === 'f' ? `${num(c * 1.8 + 32, 1)}°F` : `${num(c, 1)}°C`,
    /** Compact duration: `3h 12m`, `2d 4h`, `—` for null. */
    duration: (hours: number | null | undefined) => {
      if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—';
      const { days, hours: h, minutes } = splitHours(hours);
      if (days >= 100) return `99+${units.d}`;
      if (days > 0) return `${num(days)}${units.d} ${num(h)}${units.h}`;
      if (h > 0) return `${num(h)}${units.h} ${num(minutes)}${units.m}`;
      return `${num(minutes)}${units.m}`;
    },
    time: (ts: number, withSeconds = false) =>
      new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}) }).format(ts),
    dateTime: (ts: number) => new Intl.DateTimeFormat(tag, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ts),
  };
}
