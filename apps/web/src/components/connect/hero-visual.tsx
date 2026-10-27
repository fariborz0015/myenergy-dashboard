'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { BatteryCharging, Sun, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFmt } from '@/lib/format';

/** Decorative hero: a glowing charge ring with floating live-looking stat chips. */
/** Round SVG coordinates so server and client render identical attributes. */
const round2 = (n: number) => Math.round(n * 100) / 100;

export function HeroVisual() {
  const reduce = useReducedMotion();
  const fmt = useFmt();
  const t = useTranslations('dashboard');
  const r = 120;
  const c = 2 * Math.PI * r;
  const float = (delay: number) =>
    reduce ? {} : { animate: { y: [0, -8, 0] }, transition: { duration: 5, repeat: Infinity, ease: 'easeInOut' as const, delay } };

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[440px]" aria-hidden>
      <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--charge)_22%,transparent),transparent_65%)] blur-2xl" />
      <svg viewBox="0 0 300 300" className="relative size-full">
        <defs>
          <linearGradient id="hero-arc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--ac)" />
            <stop offset="1" stopColor="var(--charge)" />
          </linearGradient>
        </defs>
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i / 60) * Math.PI * 2;
          const r1 = 140;
          const r2 = i % 5 === 0 ? 132 : 136;
          return (
            <line
              key={i}
              x1={round2(150 + r1 * Math.cos(a))}
              y1={round2(150 + r1 * Math.sin(a))}
              x2={round2(150 + r2 * Math.cos(a))}
              y2={round2(150 + r2 * Math.sin(a))}
              stroke="currentColor"
              className="text-muted-foreground/25"
              strokeWidth={1.2}
            />
          );
        })}
        <circle cx="150" cy="150" r={r} fill="none" stroke="var(--track)" strokeWidth="14" />
        <motion.circle
          cx="150"
          cy="150"
          r={r}
          fill="none"
          stroke="url(#hero-arc)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={c}
          transform="rotate(-90 150 150)"
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - 0.82) }}
          transition={{ duration: reduce ? 0 : 1.8, ease: [0.2, 0.7, 0.2, 1] }}
          className="glow-charge"
        />
        <circle cx="150" cy="150" r="92" fill="var(--card-solid)" opacity="0.55" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <Zap className="mx-auto mb-1 size-6 text-charge" />
          <div className="text-6xl font-semibold tracking-tight tabular">{fmt.num(82)}<span className="text-2xl text-muted-foreground">{fmt.pctSign}</span></div>
          <div className="mt-1 text-sm text-muted-foreground">{fmt.duration(6.7)} {t('left')}</div>
        </div>
      </div>
      <motion.div {...float(0)} className="glass absolute start-0 top-[14%] flex items-center gap-2 rounded-2xl px-3 py-2 text-sm">
        <Sun className="size-4 text-solar" />
        <span className="font-semibold tabular">+{fmt.watts(318)}</span>
      </motion.div>
      <motion.div {...float(1.4)} className="glass absolute end-0 top-[40%] flex items-center gap-2 rounded-2xl px-3 py-2 text-sm">
        <span className="size-2 rounded-full bg-ac" />
        <span className="font-semibold tabular">{fmt.watts(192)}</span>
        <span className="text-muted-foreground">AC</span>
      </motion.div>
      <motion.div {...float(2.6)} className="glass absolute start-[8%] bottom-[10%] flex items-center gap-2 rounded-2xl px-3 py-2 text-sm">
        <BatteryCharging className="size-4 text-charge" />
        <span className="font-semibold">{t('charging')}</span>
      </motion.div>
    </div>
  );
}
