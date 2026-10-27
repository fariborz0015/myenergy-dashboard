'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { BatteryWarning, Flame, PlugZap } from 'lucide-react';
import { useFmt } from '@/lib/format';
import { useActiveAlerts } from '@/lib/hooks/use-alerts';
import { cn } from '@/lib/utils';

const ICONS = { socLow: BatteryWarning, socCritical: BatteryWarning, tempHigh: Flame, inputOverLimit: PlugZap };

export function AlertsBanner() {
  const alerts = useActiveAlerts();
  const t = useTranslations('alerts');
  const fmt = useFmt();
  return (
    <div aria-live="assertive" className="flex flex-col gap-2 empty:hidden">
      <AnimatePresence initial={false}>
        {alerts.map((a) => {
          const Icon = ICONS[a.kind];
          const value = a.kind === 'tempHigh' ? fmt.temp(a.value) : a.kind === 'inputOverLimit' ? fmt.watts(a.value) : fmt.pct(a.value);
          return (
            <motion.div
              key={a.kind}
              role="alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-3',
                  a.level === 'critical' ? 'border-danger/35 bg-danger/10' : 'border-discharge/35 bg-discharge/10',
                )}
              >
                <Icon className={cn('size-5 shrink-0', a.level === 'critical' ? 'text-danger' : 'text-discharge')} />
                <p className="text-sm">
                  <span className="font-semibold">{t(`${a.kind}.title`)}</span>
                  <span className="text-muted-foreground"> — {t(`${a.kind}.body`, { value, limit: fmt.watts(a.threshold) })}</span>
                </p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
