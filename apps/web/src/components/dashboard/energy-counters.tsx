'use client';

import { useTranslations } from 'next-intl';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { AnimatedNumber } from '@/components/animated-number';
import { Card } from '@/components/ui/card';
import { useFmt } from '@/lib/format';
import { useDevice } from '@/lib/store/device-store';

export function EnergyCounters() {
  const t = useTranslations('dashboard');
  const fmt = useFmt();
  const session = useDevice((s) => s.session);
  const today = useDevice((s) => s.today);

  const block = (title: string, whIn: number, whOut: number) => (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-charge/8 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs text-charge">
            <ArrowDownToLine className="size-3.5" />
            {t('energyIn')}
          </div>
          <AnimatedNumber value={whIn} format={(v) => fmt.energy(v)} className="mt-0.5 block text-lg font-semibold tabular" />
        </div>
        <div className="rounded-xl bg-discharge/8 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs text-discharge">
            <ArrowUpFromLine className="size-3.5" />
            {t('energyOut')}
          </div>
          <AnimatedNumber value={whOut} format={(v) => fmt.energy(v)} className="mt-0.5 block text-lg font-semibold tabular" />
        </div>
      </div>
    </div>
  );

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      {block(t('today'), today.whIn, today.whOut)}
      {block(t('session'), session.whIn, session.whOut)}
    </Card>
  );
}
