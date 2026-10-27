'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Cloud, HardDrive, Plus, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import {
  APPLIANCE_PRESETS,
  availableEnergyWh,
  hoursOf,
  maxContinuousLoadW,
  planLoad,
  type Appliance,
  type Rail,
} from '@myenergy/protocol';
import { AnimatedNumber } from '@/components/animated-number';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Segmented } from '@/components/ui/segmented';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useApi } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { useAppliances } from '@/lib/store/appliance-store';
import { useDevice } from '@/lib/store/device-store';
import { energyConfigOf, useSettings } from '@/lib/store/settings-store';
import { cn } from '@/lib/utils';
import { ApplianceIcon } from './appliance-icon';

const RAIL_COLOR: Record<Rail, string> = { ac: 'var(--ac)', dc: 'var(--dc)', usb: 'var(--usb)' };

function useApplianceName() {
  const t = useTranslations('appliances');
  return (a: Pick<Appliance, 'name' | 'icon'>) => {
    const preset = APPLIANCE_PRESETS.find((p) => p.icon === a.icon);
    return preset && preset.name === a.name && a.icon ? t(a.icon) : a.name;
  };
}

export function Planner() {
  const t = useTranslations('planner');
  const fmt = useFmt();
  const settings = useSettings();
  const liveSoc = useDevice((s) => (s.status === 'connected' ? s.telemetry.soc : null));
  const modelCode = useDevice((s) => s.info.modelCode);
  const apiStatus = useApi((s) => s.status);
  const { items, source, sync, add, update, remove, reset } = useAppliances();
  const nameOf = useApplianceName();

  const [useLive, setUseLive] = useState(true);
  // Animate rows only for user add/remove, not when the API sync swaps the list.
  const [animateRows, setAnimateRows] = useState(false);
  const [manualSoc, setManualSoc] = useState(100);
  const soc = useLive && liveSoc !== null ? liveSoc : manualSoc;
  const config = energyConfigOf(settings, modelCode);

  useEffect(() => {
    if (apiStatus === 'online') void sync();
  }, [apiStatus, sync]);

  const plan = useMemo(() => planLoad(items, soc, config, settings.ratedOutputW), [items, soc, config, settings.ratedOutputW]);
  const alone = new Map(plan.perAppliance.map((p) => [p.id, p.hoursAlone]));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">{t('battery')}</h2>
              {liveSoc !== null && (
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={useLive} onCheckedChange={setUseLive} aria-label={t('useLive')} />
                  {t('useLive')}
                </label>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between text-sm">
                  <Label htmlFor="planner-soc">{t('soc')}</Label>
                  <span className="font-semibold tabular">{fmt.pct(soc)}</span>
                </div>
                <Slider
                  id="planner-soc"
                  thumbLabel={t('soc')}
                  min={0}
                  max={100}
                  step={1}
                  value={[soc]}
                  disabled={useLive && liveSoc !== null}
                  onValueChange={([v]) => setManualSoc(v ?? manualSoc)}
                />
              </div>
              <div className="rounded-xl bg-muted/60 px-4 py-2.5 text-end sm:min-w-40">
                <div className="text-xs text-muted-foreground">{t('available')}</div>
                <div className="text-lg font-semibold tabular">{fmt.energy(availableEnergyWh(soc, config))}</div>
              </div>
            </div>
          </Card>

          <Card className="flex flex-col p-0">
            <div className="flex flex-wrap items-center gap-3 p-5 pb-3 sm:p-6 sm:pb-3">
              <h2 className="text-sm font-semibold">{t('appliances')}</h2>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                {source === 'api' ? <Cloud className="size-3.5" /> : <HardDrive className="size-3.5" />}
                {source === 'api' ? t('synced') : t('local')}
              </span>
              <div className="ms-auto flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAnimateRows(false);
                    void reset();
                  }}
                >
                  <RotateCcw />
                  {t('reset')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setAnimateRows(true);
                    add({ name: t('newName'), watts: 50, dutyPct: 100, rail: 'ac', enabled: true });
                  }}
                >
                  <Plus />
                  {t('add')}
                </Button>
              </div>
            </div>
            <ul className="flex flex-col divide-y divide-border">
              <AnimatePresence initial={false}>
                {items.map((a) => (
                  <motion.li
                    key={a.id}
                    initial={animateRows ? { opacity: 0, height: 0 } : false}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={animateRows ? { opacity: 0, height: 0 } : { opacity: 0, height: 0, transition: { duration: 0 } }}
                    className="overflow-hidden"
                  >
                    <ApplianceRow
                      a={a}
                      name={nameOf(a)}
                      alone={alone.get(a.id) ?? null}
                      onChange={(p) => update(a.id, p)}
                      onRemove={() => {
                        setAnimateRows(true);
                        remove(a.id);
                      }}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-5 lg:sticky lg:top-24">
          <ResultCard plan={plan} items={items} nameOf={nameOf} ratedW={settings.ratedOutputW} />
          <HowLongCard items={items} soc={soc} nameOf={nameOf} />
          <ReverseCard soc={soc} />
        </div>
      </div>
    </div>
  );
}

function ApplianceRow({
  a,
  name,
  alone,
  onChange,
  onRemove,
}: {
  a: Appliance;
  name: string;
  alone: number | null;
  onChange: (p: Partial<Omit<Appliance, 'id'>>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('planner');
  const fmt = useFmt();
  const id = `app-${a.id}`;
  return (
    <div className={cn('grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-3 px-5 py-4 transition-opacity sm:px-6', !a.enabled && 'opacity-60')}>
      <span
        className="grid size-10 place-items-center rounded-xl"
        style={{ background: `color-mix(in oklab, ${RAIL_COLOR[a.rail]} 15%, transparent)`, color: RAIL_COLOR[a.rail] }}
      >
        <ApplianceIcon name={a.icon} className="size-5" />
      </span>
      <div className="min-w-0">
        <input
          aria-label={t('name')}
          value={name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full truncate rounded-md bg-transparent text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        />
        <p className="text-xs text-muted-foreground tabular">
          {fmt.watts(a.watts * (a.dutyPct / 100))} · {t('alone', { value: fmt.duration(alone) })}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Switch id={id} checked={a.enabled} onCheckedChange={(v) => onChange({ enabled: v })} aria-label={name} />
        <Button variant="ghost" size="icon-sm" aria-label={t('remove', { name })} onClick={onRemove}>
          <Trash2 className="text-muted-foreground" />
        </Button>
      </div>
      <div className="col-span-3 grid grid-cols-2 gap-3 sm:grid-cols-[110px_1fr_150px] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-w`} className="text-xs text-muted-foreground">
            {t('watts')}
          </Label>
          <Input
            id={`${id}-w`}
            type="number"
            inputMode="decimal"
            min={0.1}
            max={10000}
            value={a.watts}
            onChange={(e) => onChange({ watts: Math.max(0, Number(e.target.value) || 0) })}
            className="h-9 tabular"
          />
        </div>
        <div className="order-3 col-span-2 flex flex-col gap-1.5 sm:order-none sm:col-span-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Label htmlFor={`${id}-d`} className="text-xs font-normal" title={t('dutyHint')}>
              {t('duty')}
            </Label>
            <span className="tabular">{fmt.pct(a.dutyPct)}</span>
          </div>
          <Slider id={`${id}-d`} thumbLabel={t('duty')} min={1} max={100} step={1} value={[a.dutyPct]} onValueChange={([v]) => onChange({ dutyPct: v ?? a.dutyPct })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{t('rail')}</span>
          <Segmented
            ariaLabel={t('rail')}
            value={a.rail}
            onValueChange={(v) => onChange({ rail: v })}
            options={(['ac', 'dc', 'usb'] as const).map((r) => ({ value: r, label: t(`rails.${r}`) }))}
          />
        </div>
      </div>
    </div>
  );
}

function ResultCard({
  plan,
  items,
  nameOf,
  ratedW,
}: {
  plan: ReturnType<typeof planLoad>;
  items: Appliance[];
  nameOf: (a: Appliance) => string;
  ratedW: number;
}) {
  const t = useTranslations('planner');
  const fmt = useFmt();
  const active = items.filter((a) => a.enabled);
  const total = plan.averageLoadW || 1;
  return (
    <Card className="flex flex-col gap-5 overflow-hidden p-5 sm:p-6">
      <div>
        <p className="text-sm text-muted-foreground">{t('runtime')}</p>
        <div className="mt-1 text-5xl font-semibold tracking-tight tabular" data-testid="planner-runtime">
          {fmt.duration(plan.runtimeHours)}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{plan.runtimeHours === null ? t('nothingSelected') : t('runtimeHint')}</p>
      </div>
      {active.length > 0 && (
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-track" aria-hidden>
          {active.map((a) => (
            <motion.span
              key={a.id}
              layout
              className="h-full border-e border-background/40 last:border-e-0"
              style={{ width: `${((a.watts * a.dutyPct) / 100 / total) * 100}%`, background: RAIL_COLOR[a.rail] }}
              title={nameOf(a)}
            />
          ))}
        </div>
      )}
      <dl className="grid grid-cols-3 gap-2">
        {[
          [t('averageLoad'), plan.averageLoadW],
          [t('peak'), plan.peakLoadW],
          [t('draw'), plan.batteryDrawW],
        ].map(([label, v]) => (
          <div key={label as string} className="rounded-xl bg-muted/60 px-3 py-2">
            <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
            <dd className="text-sm font-semibold tabular">
              <AnimatedNumber value={v as number} format={(x) => fmt.watts(Math.round(x))} />
            </dd>
          </div>
        ))}
      </dl>
      {plan.exceedsRated && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {t('exceeds', { value: fmt.watts(plan.peakLoadW), rated: fmt.watts(ratedW) })}
        </p>
      )}
    </Card>
  );
}

function HowLongCard({ items, soc, nameOf }: { items: Appliance[]; soc: number; nameOf: (a: Appliance) => string }) {
  const t = useTranslations('planner');
  const fmt = useFmt();
  const settings = useSettings();
  const modelCode = useDevice((s) => s.info.modelCode);
  const config = energyConfigOf(settings, modelCode);
  const [pick, setPick] = useState<string>('custom');
  const [watts, setWatts] = useState(100);
  const [rail, setRail] = useState<Rail>('ac');
  const chosen = items.find((a) => a.id === pick);
  const w = chosen ? (chosen.watts * chosen.dutyPct) / 100 : watts;
  const r = chosen ? chosen.rail : rail;
  const hours = hoursOf(w, r, soc, config);

  return (
    <Card className="flex flex-col gap-3 p-5 sm:p-6">
      <h2 className="text-sm font-semibold">{t('howLong')}</h2>
      <NativeSelect value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t('howLong')}>
        <option value="custom">{t('custom')}</option>
        {items.map((a) => (
          <option key={a.id} value={a.id}>
            {nameOf(a)} · {fmt.watts(a.watts)}
          </option>
        ))}
      </NativeSelect>
      {!chosen && (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input type="number" inputMode="decimal" min={1} value={watts} onChange={(e) => setWatts(Math.max(0, Number(e.target.value) || 0))} aria-label={t('watts')} className="tabular" />
          <Segmented
            ariaLabel={t('rail')}
            className="w-40"
            value={rail}
            onValueChange={setRail}
            options={(['ac', 'dc', 'usb'] as const).map((x) => ({ value: x, label: t(`rails.${x}`) }))}
          />
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {t.rich('howLongResult', {
          value: fmt.duration(hours),
          b: (chunks) => <span className="ms-1 text-2xl font-semibold text-foreground tabular">{chunks}</span>,
        })}
      </p>
    </Card>
  );
}

function ReverseCard({ soc }: { soc: number }) {
  const t = useTranslations('planner');
  const fmt = useFmt();
  const settings = useSettings();
  const modelCode = useDevice((s) => s.info.modelCode);
  const config = energyConfigOf(settings, modelCode);
  const [hours, setHours] = useState(8);
  const [rail, setRail] = useState<Rail>('ac');
  const max = maxContinuousLoadW(hours, soc, config, rail);
  return (
    <Card className="flex flex-col gap-3 p-5 sm:p-6">
      <h2 className="text-sm font-semibold">{t('reverse')}</h2>
      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
        <div className="relative">
          <Input type="number" inputMode="decimal" min={0.5} step={0.5} value={hours} onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))} aria-label={t('hours')} className="pe-14 tabular" />
          <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{t('hours')}</span>
        </div>
        <Segmented
          ariaLabel={t('rail')}
          className="w-40"
          value={rail}
          onValueChange={setRail}
          options={(['ac', 'dc', 'usb'] as const).map((x) => ({ value: x, label: t(`rails.${x}`) }))}
        />
      </div>
      <div className="rounded-xl bg-muted/60 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {t('reverseResult')} {t('reverseRail', { rail: t(`rails.${rail}`) })}
        </p>
        <p className="mt-1 text-2xl font-semibold tabular" style={{ color: RAIL_COLOR[rail] }}>
          {fmt.watts(Math.floor(max))}
        </p>
      </div>
    </Card>
  );
}
