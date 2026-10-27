'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDownToLine, ArrowUpFromLine, CloudOff, Gauge, History as HistoryIcon, RefreshCw, Thermometer } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { api, checkApi, useApi, type ApiDevice, type TelemetryResponse } from '@/lib/api';
import { useFmt, type Fmt } from '@/lib/format';
import { useDevice } from '@/lib/store/device-store';

const RANGES = {
  '1h': { ms: 3600e3, bucket: '10s' },
  '6h': { ms: 6 * 3600e3, bucket: '1m' },
  '24h': { ms: 24 * 3600e3, bucket: '5m' },
  '48h': { ms: 48 * 3600e3, bucket: '15m' },
  '7d': { ms: 7 * 24 * 3600e3, bucket: '1h' },
} as const;
type RangeKey = keyof typeof RANGES;

interface Point {
  ts: number;
  soc: number | null;
  tempC: number | null;
  inW: number;
  outW: number;
}

export function History() {
  const t = useTranslations('history');
  const fmt = useFmt();
  const apiStatus = useApi((s) => s.status);
  const liveSn = useDevice((s) => s.info.deviceSn);
  const localHistory = useDevice((s) => s.history);
  const [devices, setDevices] = useState<ApiDevice[] | null>(null);
  const [sn, setSn] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>('24h');
  const [data, setData] = useState<TelemetryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.devices();
      setDevices(list);
      setFailed(false);
      setSn((cur) => cur ?? (liveSn && list.some((d) => d.sn === liveSn) ? liveSn : (list[0]?.sn ?? null)));
      if (!list.length) setLoading(false);
    } catch {
      setFailed(true);
      setLoading(false);
    }
  }, [liveSn]);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (!sn) return;
    let alive = true;
    const load = async () => {
      const to = Date.now();
      try {
        const r = await api.telemetry(sn, to - RANGES[range].ms, to, RANGES[range].bucket);
        if (alive) {
          setData(r);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    };
    setLoading(true);
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [sn, range]);

  const retry = async () => {
    await checkApi();
    void loadDevices();
  };

  const offline = failed || apiStatus === 'offline';
  const points: Point[] = useMemo(
    () => (offline ? localHistory.map((h) => ({ ts: h.ts, soc: h.soc, tempC: null, inW: h.inW, outW: h.outW })) : (data?.points ?? [])),
    [offline, localHistory, data],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{offline ? t('sessionOnly') : t('subtitle')}</p>
        </div>
        {!offline && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {devices && devices.length > 1 && (
              <NativeSelect aria-label={t('device')} value={sn ?? ''} onChange={(e) => setSn(e.target.value)} className="sm:w-56">
                {devices.map((d) => (
                  <option key={d.sn} value={d.sn}>
                    {d.name ?? d.sn}
                  </option>
                ))}
              </NativeSelect>
            )}
            <Segmented
              ariaLabel={t('title')}
              className="sm:w-auto"
              value={range}
              onValueChange={setRange}
              options={(Object.keys(RANGES) as RangeKey[]).map((k) => ({ value: k, label: t(`ranges.${k}`) }))}
            />
          </div>
        )}
      </header>

      {offline && (
        <div role="status" className="flex flex-col gap-3 rounded-2xl border border-discharge/30 bg-discharge/10 p-4 sm:flex-row sm:items-center">
          <CloudOff className="size-5 shrink-0 text-discharge" />
          <div className="flex-1 text-sm">
            <p className="font-medium">{t('offline.title')}</p>
            <p className="text-muted-foreground">{t('offline.body')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={retry}>
            <RefreshCw />
            {t('offline.retry')}
          </Button>
        </div>
      )}

      {loading && !offline ? (
        <div className="flex flex-col gap-5" aria-busy="true">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : !offline && devices?.length === 0 ? (
        <EmptyHistory />
      ) : (
        <>
          {!offline && data && <Summary data={data} fmt={fmt} />}
          {points.length === 0 ? (
            <Card className="grid h-56 place-items-center text-sm text-muted-foreground">{t('noData')}</Card>
          ) : (
            <Charts points={points} fmt={fmt} spanMs={offline ? 10 * 60e3 : RANGES[range].ms} showTemp={!offline} />
          )}
          {!offline && data && <p className="text-xs text-muted-foreground">{t('resolution', { bucket: data.bucket })}</p>}
        </>
      )}
    </div>
  );
}

function EmptyHistory() {
  const t = useTranslations('history.empty');
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-ac/12 text-ac">
        <HistoryIcon className="size-6" />
      </span>
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{t('body')}</p>
    </Card>
  );
}

function Summary({ data, fmt }: { data: TelemetryResponse; fmt: Fmt }) {
  const t = useTranslations('history');
  const s = data.summary;
  const tiles = [
    { label: t('whIn'), value: fmt.energy(s.whIn), icon: ArrowDownToLine, tone: 'text-charge bg-charge/12' },
    { label: t('whOut'), value: fmt.energy(s.whOut), icon: ArrowUpFromLine, tone: 'text-discharge bg-discharge/12' },
    { label: t('peakOut'), value: fmt.watts(s.peakOutW), icon: Gauge, tone: 'text-ac bg-ac/12' },
    { label: t('avgTemp'), value: fmt.temp(s.avgTempC), icon: Thermometer, tone: 'text-dc bg-dc/12' },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((x) => (
        <Card key={x.label} className="flex items-center gap-3 p-4">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${x.tone}`}>
            <x.icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{x.label}</p>
            <p className="truncate text-lg font-semibold tabular">{x.value}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, fmt, rows }: { active?: boolean; payload?: { payload: Point }[]; fmt: Fmt; rows: { key: keyof Point; label: string; color: string; f: (v: number) => string }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 text-muted-foreground">{fmt.dateTime(p.ts)}</div>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2 tabular">
          <span className="size-2 rounded-full" style={{ background: r.color }} />
          <span className="text-muted-foreground">{r.label}</span>
          <span className="ms-auto font-medium">{p[r.key] === null ? '—' : r.f(p[r.key] as number)}</span>
        </div>
      ))}
    </div>
  );
}

function Charts({ points, fmt, spanMs, showTemp }: { points: Point[]; fmt: Fmt; spanMs: number; showTemp: boolean }) {
  const t = useTranslations('history');
  const tick = (ts: number) => (spanMs > 36 * 3600e3 ? fmt.dateTime(ts) : fmt.time(ts));
  const axis = { stroke: 'var(--muted-foreground)', fontSize: 11, tickLine: false, axisLine: false } as const;
  const grid = <CartesianGrid stroke="var(--border)" vertical={false} />;
  const x = <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} minTickGap={48} {...axis} />;

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">{t('power')}</h2>
        <div className="h-72" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="h-in" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--charge)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--charge)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="h-out" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--discharge)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--discharge)" stopOpacity={0} />
                </linearGradient>
              </defs>
              {grid}
              {x}
              <YAxis width={56} tickFormatter={(v: number) => fmt.watts(v)} {...axis} />
              <Tooltip
                content={
                  <ChartTooltip
                    fmt={fmt}
                    rows={[
                      { key: 'inW', label: t('in'), color: 'var(--charge)', f: fmt.watts },
                      { key: 'outW', label: t('out'), color: 'var(--discharge)', f: fmt.watts },
                    ]}
                  />
                }
              />
              <Area type="monotone" dataKey="inW" stroke="var(--charge)" strokeWidth={2} fill="url(#h-in)" isAnimationActive={false} />
              <Area type="monotone" dataKey="outW" stroke="var(--discharge)" strokeWidth={2} fill="url(#h-out)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className={showTemp ? 'grid gap-5 lg:grid-cols-2' : 'grid gap-5'}>
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">{t('soc')}</h2>
          <div className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="h-soc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--ac)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--ac)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                {grid}
                {x}
                <YAxis width={40} domain={[0, 100]} tickFormatter={(v: number) => fmt.pct(v)} {...axis} />
                <Tooltip content={<ChartTooltip fmt={fmt} rows={[{ key: 'soc', label: t('soc'), color: 'var(--ac)', f: fmt.pct }]} />} />
                <Area type="monotone" dataKey="soc" stroke="var(--ac)" strokeWidth={2} fill="url(#h-soc)" isAnimationActive={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        {showTemp && (
          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 text-sm font-medium text-muted-foreground">{t('temperature')}</h2>
            <div className="h-56" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  {grid}
                  {x}
                  <YAxis width={48} domain={['dataMin - 2', 'dataMax + 2']} tickFormatter={(v: number) => fmt.temp(v)} {...axis} />
                  <Tooltip content={<ChartTooltip fmt={fmt} rows={[{ key: 'tempC', label: t('temperature'), color: 'var(--dc)', f: fmt.temp }]} />} />
                  <Line type="monotone" dataKey="tempC" stroke="var(--dc)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
