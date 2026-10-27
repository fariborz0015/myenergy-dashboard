'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { ArrowDownRight, ArrowUpRight, Cpu, Minus, Thermometer } from 'lucide-react';
import { AnimatedNumber } from '@/components/animated-number';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFmt } from '@/lib/format';
import { useEnergy } from '@/lib/hooks/use-energy';
import { useDevice } from '@/lib/store/device-store';
import { useSettings } from '@/lib/store/settings-store';
import { cn } from '@/lib/utils';

const SIZE = 260;
const STROKE = 16;
const R = (SIZE - STROKE) / 2 - 10;
const C = 2 * Math.PI * R;

/** Round SVG coordinates so server and client render identical attributes. */
const round2 = (n: number) => Math.round(n * 100) / 100;

export function SocHero() {
  const t = useTranslations('dashboard');
  const fmt = useFmt();
  const reduce = useReducedMotion();
  const soc = useDevice((s) => s.telemetry.soc);
  const tempC = useDevice((s) => s.telemetry.tempC);
  const socLow = useSettings((s) => s.socLow);
  const socCritical = useSettings((s) => s.socCritical);
  const tempHigh = useSettings((s) => s.tempHighC);
  const e = useEnergy();

  const pct = soc ?? 0;
  const tone =
    soc !== null && soc < socCritical ? 'danger' : soc !== null && soc < socLow ? 'discharge' : e.direction === 'discharging' ? 'discharge' : 'charge';
  const color = `var(--${tone})`;
  const charging = e.direction === 'charging';
  const headline = charging ? e.toFull : e.runtime;
  const headlineLabel = charging ? (soc === 100 ? t('full') : t('toFull')) : e.runtime === null ? t('noLoad') : t('left');
  const DirIcon = e.direction === 'charging' ? ArrowDownRight : e.direction === 'discharging' ? ArrowUpRight : Minus;

  return (
    <Card className="flex h-full flex-col gap-4 p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{t('soc')}</h2>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-muted/70 px-2.5 py-1 text-xs font-medium tabular',
            tempC !== null && tempC > tempHigh && 'bg-danger/15 text-danger',
          )}
          aria-label={`${t('temperature')} ${fmt.temp(tempC)}`}
        >
          <Thermometer className="size-3.5" />
          {fmt.temp(tempC)}
        </span>
      </div>

      <div className="relative mx-auto grid aspect-square w-full max-w-[260px] place-items-center">
        <div
          className="absolute inset-[14%] rounded-full blur-2xl transition-colors duration-700"
          style={{ background: `radial-gradient(circle, color-mix(in oklab, ${color} 28%, transparent), transparent 70%)` }}
          aria-hidden
        />
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 size-full -rotate-90 rtl:scale-x-[-1]" aria-hidden>
          <defs>
            <linearGradient id="soc-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={tone === 'charge' ? 'var(--ac)' : color} />
              <stop offset="1" stopColor={color} />
            </linearGradient>
          </defs>
          {Array.from({ length: 48 }, (_, i) => {
            const a = (i / 48) * Math.PI * 2;
            const r1 = SIZE / 2 - 2;
            const r2 = r1 - (i % 4 === 0 ? 7 : 4);
            const lit = i / 48 < pct / 100;
            return (
              <line
                key={i}
                x1={round2(SIZE / 2 + r1 * Math.cos(a))}
                y1={round2(SIZE / 2 + r1 * Math.sin(a))}
                x2={round2(SIZE / 2 + r2 * Math.cos(a))}
                y2={round2(SIZE / 2 + r2 * Math.sin(a))}
                strokeWidth={1.5}
                stroke={lit ? color : 'currentColor'}
                className={cn('transition-[stroke] duration-700', !lit && 'text-muted-foreground/25')}
              />
            );
          })}
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--track)" strokeWidth={STROKE} />
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="url(#soc-grad)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - pct / 100) }}
            transition={{ duration: reduce ? 0 : 1.2, ease: [0.2, 0.7, 0.2, 1] }}
            style={{ filter: `drop-shadow(0 0 10px color-mix(in oklab, ${color} calc(var(--glow-strength) * 100%), transparent))` }}
          />
        </svg>
        <div className="relative flex flex-col items-center text-center" role="status" aria-live="polite">
          <div className="flex items-baseline font-semibold tracking-tight">
            <AnimatedNumber value={soc} format={(v) => fmt.num(Math.round(v))} className="text-6xl tabular sm:text-7xl" />
            <span className="ms-0.5 text-2xl text-muted-foreground">{fmt.pctSign}</span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground" data-testid="runtime">
            {charging && soc === 100 ? (
              headlineLabel
            ) : (
              <>
                <span className="font-semibold text-foreground tabular">{fmt.duration(headline)}</span> {headlineLabel}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium',
            e.direction === 'charging' && 'bg-charge/12 text-charge',
            e.direction === 'discharging' && 'bg-discharge/12 text-discharge',
            e.direction === 'idle' && 'bg-muted text-muted-foreground',
          )}
        >
          <DirIcon className="size-4" />
          {t(e.direction)}
          {e.direction !== 'idle' && (
            <AnimatedNumber value={Math.abs(e.netW)} format={(v) => `${e.netW > 0 ? '+' : '−'}${fmt.watts(Math.round(v))}`} className="tabular" />
          )}
        </div>
        <BatteryChips />
        {e.deviceRuntime !== null && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-help items-center gap-1.5 text-xs text-muted-foreground" tabIndex={0}>
                <Cpu className="size-3.5" />
                {t('deviceEstimate', { value: fmt.duration(e.deviceRuntime) })}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t('ourEstimate')}: {fmt.duration(e.runtime)} · {fmt.energy(e.config.capacityWh)} × {fmt.num(e.config.usableFactor * 100)}%
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2">
        <MiniStat label={t('input')} value={e.inW} tone="charge" fmt={fmt.watts} />
        <MiniStat label={t('output')} value={e.outW} tone="discharge" fmt={fmt.watts} />
      </div>
    </Card>
  );
}

function MiniStat({ label, value, tone, fmt }: { label: string; value: number; tone: 'charge' | 'discharge'; fmt: (v: number) => string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn('size-1.5 rounded-full', tone === 'charge' ? 'bg-charge' : 'bg-discharge')} />
        {label}
      </div>
      <AnimatedNumber value={value} format={(v) => fmt(Math.round(v))} className="mt-0.5 block text-lg font-semibold tabular" />
    </div>
  );
}

/** Health, current and cell voltage from the 53 frame (shown only when the station reports them). */
function BatteryChips() {
  const t = useTranslations('dashboard');
  const fmt = useFmt();
  const soh = useDevice((s) => s.telemetry.sohPct);
  const current = useDevice((s) => s.telemetry.batteryCurrentA);
  const cells = useDevice((s) => s.telemetry.cellVoltagesV);
  const cellV = cells.length ? cells.reduce((a, b) => a + b, 0) / cells.length : null;
  const items = [
    soh !== null && { key: 'soh', label: t('health'), value: fmt.pct(soh) },
    current !== null && { key: 'current', label: t('current'), value: `${fmt.num(current, 2)} A` },
    cellV !== null && { key: 'cell', label: t('cell'), value: `${fmt.num(cellV, 2)} V` },
  ].filter(Boolean) as { key: string; label: string; value: string }[];
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap justify-center gap-1.5 text-[11px]" aria-label={t('batteryDetails')}>
      {items.map((i) => (
        <li key={i.key} className="rounded-full bg-muted/60 px-2 py-0.5 text-muted-foreground">
          {i.label} <span className="font-medium text-foreground tabular" dir="ltr">{i.value}</span>
        </li>
      ))}
    </ul>
  );
}
