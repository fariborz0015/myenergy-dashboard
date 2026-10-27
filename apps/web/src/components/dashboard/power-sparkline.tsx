'use client';

import { useTranslations } from 'next-intl';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { useFmt } from '@/lib/format';
import { HISTORY_WINDOW_MS, useDevice } from '@/lib/store/device-store';

export function PowerSparkline() {
  const t = useTranslations('dashboard');
  const fmt = useFmt();
  const history = useDevice((s) => s.history);
  const now = history.at(-1)?.ts ?? Date.now();
  // Fill the width while less than 10 minutes have been collected.
  const start = Math.max(history[0]?.ts ?? now - HISTORY_WINDOW_MS, now - HISTORY_WINDOW_MS);

  return (
    <Card className="flex flex-col gap-3 p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{t('sparkTitle')}</h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-charge" />
            {t('input')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-discharge" />
            {t('output')}
          </span>
        </div>
      </div>
      <div className="h-44 w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="spark-in" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--charge)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--charge)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="spark-out" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--discharge)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--discharge)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="ts" type="number" domain={[start, Math.max(now, start + 1000)]} hide />
            <YAxis hide domain={[0, (max: number) => Math.max(50, Math.ceil(max * 1.15))]} />
            <Tooltip
              cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.3 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as { ts: number; inW: number; outW: number } | undefined;
                if (!active || !p) return null;
                return (
                  <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-xl">
                    <div className="mb-1 text-muted-foreground">{fmt.time(p.ts, true)}</div>
                    <div className="flex gap-3 tabular">
                      <span className="text-charge">↓ {fmt.watts(p.inW)}</span>
                      <span className="text-discharge">↑ {fmt.watts(p.outW)}</span>
                    </div>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="inW" stroke="var(--charge)" strokeWidth={2} fill="url(#spark-in)" isAnimationActive={false} dot={false} />
            <Area type="monotone" dataKey="outW" stroke="var(--discharge)" strokeWidth={2} fill="url(#spark-out)" isAnimationActive={false} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
