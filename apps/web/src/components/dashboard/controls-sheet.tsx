'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { LoaderCircle } from 'lucide-react';
import { LightMode, presetForModel, TIMER_UNITS, type SwitchName, type TimerName } from '@myenergy/protocol';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Segmented } from '@/components/ui/segmented';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { deviceConnection } from '@/lib/device/connection';
import { useFmt } from '@/lib/format';
import { effectiveSwitches, useDevice } from '@/lib/store/device-store';

/** The original app's picker options (minutes for most timers, seconds for the screen). */
const LONG_MINUTES = [5, 10, 20, 30, 60, 120, 300, 600, 1200, 1440, 2880, 7200, 14400, 0];
const SCREEN_SECONDS = [60, 120, 180, 240, 300, 600, 1200, 1800, 3600, 7200, 18000, 36000, 0];
const TIMERS: TimerName[] = ['autoShutdown', 'acAutoOff', 'dcAutoOff', 'usbAutoOff', 'screenOff'];
const MODE_SWITCHES: { name: SwitchName; key: string; hint?: string }[] = [
  { name: 'acConstantPower', key: 'acConstantPower', hint: 'acConstantPowerHint' },
  { name: 'silentMode', key: 'silentMode', hint: 'silentModeHint' },
  { name: 'keySound', key: 'keySound' },
  { name: 'wifi', key: 'wifiSwitch' },
];

async function run(p: Promise<unknown>, okMsg: string, failMsg: (e: string) => string) {
  try {
    await p;
    toast.success(okMsg);
  } catch (e) {
    toast.error(failMsg(e instanceof Error ? e.message : String(e)));
  }
}

export function ControlsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('controls');
  const tc = useTranslations('common');
  const fmt = useFmt();
  const telemetry = useDevice((s) => s.telemetry);
  const pending = useDevice((s) => s.pending);
  const modelCode = useDevice((s) => s.info.modelCode);
  const readOnly = useDevice((s) => s.mode === 'watch' || s.status !== 'connected');
  const switches = effectiveSwitches({ telemetry, pending });
  const maxCharge = presetForModel(modelCode)?.maxChargeW ?? 1200;

  const [limit, setLimit] = useState<number>(telemetry.chargeLimitW ?? 400);
  const [backlight, setBacklight] = useState<number>(telemetry.backlight ?? 50);
  useEffect(() => {
    if (open) {
      setLimit(useDevice.getState().telemetry.chargeLimitW ?? 400);
      setBacklight(useDevice.getState().telemetry.backlight ?? 50);
    }
  }, [open]);

  const sent = t('sent');
  const failed = (e: string) => t('failed', { error: e });

  const optionLabel = (name: TimerName, v: number) => {
    if (v === 0) return t('never');
    const minutes = TIMER_UNITS[name] === 'seconds' ? v / 60 : v;
    if (minutes < 60) return t('minutes', { n: fmt.num(minutes) });
    if (minutes < 1440) return t('hours', { n: fmt.num(minutes / 60) });
    return t('days', { n: minutes / 1440 });
  };

  const lightValue = (Object.entries(LightMode).find(([, v]) => v === telemetry.lightWorkMode)?.[0] ?? 'off') as keyof typeof LightMode;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent closeLabel={tc('close')}>
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 p-6 pt-4">
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="charge-limit">{t('chargeLimit')}</Label>
              <span className="text-sm font-semibold tabular">{fmt.watts(limit)}</span>
            </div>
            <Slider
              id="charge-limit"
              thumbLabel={t('chargeLimit')}
              min={100}
              max={maxCharge}
              step={50}
              value={[limit]}
              disabled={readOnly}
              onValueChange={([v]) => setLimit(v ?? limit)}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{t('chargeLimitHint')}</p>
              <Button
                size="sm"
                variant="secondary"
                disabled={readOnly || limit === telemetry.chargeLimitW}
                onClick={() => run(deviceConnection.setChargeLimit(limit), sent, failed)}
              >
                {t('apply')}
              </Button>
            </div>
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{t('timers')}</h3>
            {TIMERS.map((name) => {
              const current = telemetry.timersSet?.[name] ?? 0;
              const base = name === 'screenOff' ? SCREEN_SECONDS : LONG_MINUTES;
              const options = base.includes(current) ? base : [...base.slice(0, -1), current, 0].sort((a, b) => (a || Infinity) - (b || Infinity));
              const remaining = telemetry.timersRemaining?.[name] ?? 0;
              const remainingH = TIMER_UNITS[name] === 'seconds' ? remaining / 3600 : remaining / 60;
              return (
                <div key={name} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                  <Label htmlFor={`timer-${name}`} className="text-sm font-normal">
                    {t(`timerNames.${name}`)}
                  </Label>
                  <NativeSelect
                    id={`timer-${name}`}
                    className="w-36"
                    value={current}
                    disabled={readOnly || !telemetry.timersSet}
                    onChange={(e) => run(deviceConnection.setTimer(name, Number(e.target.value)), sent, failed)}
                  >
                    {options.map((v) => (
                      <option key={v} value={v}>
                        {optionLabel(name, v)}
                      </option>
                    ))}
                  </NativeSelect>
                  {current > 0 && remaining > 0 && (
                    <p className="col-span-2 text-xs text-muted-foreground">{t('remaining', { value: fmt.duration(remainingH) })}</p>
                  )}
                </div>
              );
            })}
          </section>

          <Separator />

          <section className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold">{t('display')}</h3>
            <div className="flex flex-col gap-2">
              <span className="text-sm">{t('light')}</span>
              <Segmented
                ariaLabel={t('light')}
                value={lightValue}
                disabled={readOnly}
                onValueChange={(v) => run(deviceConnection.setLightMode(LightMode[v]), sent, failed)}
                options={(Object.keys(LightMode) as (keyof typeof LightMode)[]).map((k) => ({ value: k, label: t(`lightModes.${k}`) }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="backlight">{t('backlight')}</Label>
                <span className="text-sm font-semibold tabular">{fmt.pct(backlight)}</span>
              </div>
              <Slider
                id="backlight"
                thumbLabel={t('backlight')}
                min={0}
                max={100}
                step={5}
                value={[backlight]}
                disabled={readOnly}
                onValueChange={([v]) => setBacklight(v ?? backlight)}
                onValueCommit={([v]) => v !== undefined && run(deviceConnection.setBacklight(v), sent, failed)}
              />
            </div>
          </section>

          <Separator />

          <section className="flex flex-col gap-1">
            <h3 className="mb-2 text-sm font-semibold">{t('modes')}</h3>
            {MODE_SWITCHES.map(({ name, key, hint }) => {
              const isPending = !!pending[name];
              return (
                <div key={name} className="flex items-center justify-between gap-4 rounded-xl px-1 py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <Label htmlFor={`mode-${name}`} className="font-normal">
                      {t(key)}
                    </Label>
                    {hint && <span className="text-xs text-muted-foreground">{t(hint)}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {isPending && <LoaderCircle className="size-4 animate-spin text-muted-foreground" />}
                    <Switch
                      id={`mode-${name}`}
                      checked={switches?.[name] ?? false}
                      disabled={readOnly || !switches}
                      onCheckedChange={(on) => run(deviceConnection.setSwitch(name, on), sent, failed)}
                    />
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
