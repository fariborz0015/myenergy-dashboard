'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Battery, Bell, Bluetooth, Info, Palette, RotateCcw } from 'lucide-react';
import { presetForModel, DEFAULT_ENERGY_CONFIG } from '@myenergy/protocol';
import { StatusDot } from '@/components/layout/connection-pill';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { API_URL, useApi } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { useDevice } from '@/lib/store/device-store';
import { useSettings } from '@/lib/store/settings-store';
import { isValidServiceUuidList } from '@/lib/uuid';
import { cn } from '@/lib/utils';

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </h2>
      <div className="flex flex-col gap-6">{children}</div>
    </Card>
  );
}

function Field({ label, htmlFor, hint, value, children }: { label: string; htmlFor?: string; hint?: React.ReactNode; value?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor}>{label}</Label>
        {value && <span className="text-sm font-semibold tabular">{value}</span>}
      </div>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SettingsView() {
  const t = useTranslations('settings');
  const tt = useTranslations('theme');
  const fmt = useFmt();
  const s = useSettings();
  const locale = useLocale();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const apiStatus = useApi((x) => x.status);
  const modelCode = useDevice((x) => x.info.modelCode);
  const preset = presetForModel(modelCode);
  const autoCapacity = preset?.capacityWh ?? DEFAULT_ENERGY_CONFIG.capacityWh;
  const [uuid, setUuid] = useState(s.customServiceUuid);
  const uuidValid = isValidServiceUuidList(uuid);
  useEffect(() => setMounted(true), []);

  const setLocale = (next: string) => {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <Section icon={Palette} title={t('appearance')}>
            <Field label={t('theme')}>
              <Segmented
                ariaLabel={t('theme')}
                value={mounted ? (theme ?? 'dark') : 'dark'}
                onValueChange={setTheme}
                options={(['dark', 'light', 'system'] as const).map((v) => ({ value: v, label: tt(v) }))}
              />
            </Field>
            <Field label={t('language')}>
              <Segmented
                ariaLabel={t('language')}
                value={locale}
                disabled={pending}
                onValueChange={setLocale}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'fa', label: 'فارسی' },
                ]}
              />
            </Field>
            <div className={cn('flex items-center justify-between gap-4', locale !== 'fa' && 'opacity-60')}>
              <div className="flex flex-col gap-1">
                <Label htmlFor="persian-digits">{t('digits')}</Label>
                <span className="text-xs text-muted-foreground">{t('digitsHint')}</span>
              </div>
              <Switch id="persian-digits" checked={s.persianDigits} onCheckedChange={(v) => s.update({ persianDigits: v })} />
            </div>
            <Field label={t('tempUnit')}>
              <Segmented
                ariaLabel={t('tempUnit')}
                value={s.tempUnit}
                onValueChange={(v) => s.update({ tempUnit: v })}
                options={[
                  { value: 'c', label: '°C' },
                  { value: 'f', label: '°F' },
                ]}
              />
            </Field>
          </Section>

          <Section icon={Bluetooth} title={t('connection')}>
            <Field
              label={t('uuid')}
              htmlFor="custom-uuid"
              hint={uuidValid ? t('uuidHint') : <span className="text-danger">{t('uuidInvalid')}</span>}
            >
              <Input
                id="custom-uuid"
                value={uuid}
                placeholder="fff0, 0000abf0-…"
                spellCheck={false}
                autoCapitalize="none"
                aria-invalid={!uuidValid}
                className="font-mono"
                onChange={(e) => setUuid(e.target.value)}
                onBlur={() => {
                  if (uuidValid && uuid !== s.customServiceUuid) {
                    s.update({ customServiceUuid: uuid.trim() });
                    toast.success(t('uuid'));
                  }
                }}
              />
            </Field>
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="cloud-sync">{t('cloudSync')}</Label>
                <span className="text-xs text-muted-foreground">{t('cloudSyncHint', { url: API_URL })}</span>
              </div>
              <Switch id="cloud-sync" checked={s.cloudSync} onCheckedChange={(v) => s.update({ cloudSync: v })} />
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm">
              <StatusDot status={apiStatus === 'online' ? 'connected' : apiStatus === 'offline' ? 'error' : 'connecting'} />
              <span className="text-muted-foreground">{t('apiStatus')}</span>
              <span className="font-medium">{t(apiStatus)}</span>
              <span className="ms-auto truncate font-mono text-xs text-muted-foreground" dir="ltr">
                {API_URL}
              </span>
            </div>
          </Section>
        </div>

        <div className="flex flex-col gap-5">
          <Section icon={Battery} title={t('battery')}>
            <Field
              label={t('capacity')}
              htmlFor="capacity"
              hint={
                s.capacityWh === null
                  ? preset
                    ? t('capacityAuto', { value: fmt.energy(autoCapacity), model: preset.label })
                    : t('capacityAutoDefault', { value: fmt.energy(autoCapacity) })
                  : t('capacityHint')
              }
            >
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Input
                    id="capacity"
                    type="number"
                    inputMode="numeric"
                    min={50}
                    max={100000}
                    disabled={s.capacityWh === null}
                    value={s.capacityWh ?? autoCapacity}
                    onChange={(e) => s.update({ capacityWh: Math.max(50, Number(e.target.value) || 50) })}
                    className="pe-12 tabular"
                  />
                  <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Wh</span>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={s.capacityWh === null} onCheckedChange={(auto) => s.update({ capacityWh: auto ? null : autoCapacity })} aria-label={t('auto')} />
                  {t('auto')}
                </label>
              </div>
            </Field>
            <Field label={t('usable')} value={fmt.pct(Math.round(s.usableFactor * 100))} hint={t('usableHint')}>
              <Slider thumbLabel={t('usable')} min={50} max={100} step={1} value={[Math.round(s.usableFactor * 100)]} onValueChange={([v]) => s.update({ usableFactor: (v ?? 90) / 100 })} />
            </Field>
            <Field label={t('effAc')} value={fmt.pct(Math.round(s.effAc * 100))}>
              <Slider thumbLabel={t('effAc')} min={60} max={100} step={1} value={[Math.round(s.effAc * 100)]} onValueChange={([v]) => s.update({ effAc: (v ?? 88) / 100 })} />
            </Field>
            <Field label={t('effDc')} value={fmt.pct(Math.round(s.effDc * 100))}>
              <Slider thumbLabel={t('effDc')} min={60} max={100} step={1} value={[Math.round(s.effDc * 100)]} onValueChange={([v]) => s.update({ effDc: (v ?? 95) / 100 })} />
            </Field>
            <Field label={t('rated')} htmlFor="rated">
              <div className="relative">
                <Input
                  id="rated"
                  type="number"
                  inputMode="numeric"
                  min={50}
                  max={10000}
                  value={s.ratedOutputW}
                  onChange={(e) => s.update({ ratedOutputW: Math.max(50, Number(e.target.value) || 50) })}
                  className="pe-10 tabular"
                />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">W</span>
              </div>
            </Field>
          </Section>

          <Section icon={Bell} title={t('alerts')}>
            <Field label={t('socLow')} value={fmt.pct(s.socLow)}>
              <Slider thumbLabel={t('socLow')} min={5} max={50} step={1} value={[s.socLow]} onValueChange={([v]) => s.update({ socLow: v ?? 20 })} />
            </Field>
            <Field label={t('socCritical')} value={fmt.pct(s.socCritical)}>
              <Slider thumbLabel={t('socCritical')} min={1} max={30} step={1} value={[s.socCritical]} onValueChange={([v]) => s.update({ socCritical: v ?? 10 })} />
            </Field>
            <Field label={t('tempHigh')} value={fmt.temp(s.tempHighC)}>
              <Slider thumbLabel={t('tempHigh')} min={30} max={70} step={1} value={[s.tempHighC]} onValueChange={([v]) => s.update({ tempHighC: v ?? 45 })} />
            </Field>
          </Section>

          <Section icon={Info} title={t('about')}>
            <p className="text-sm leading-relaxed text-muted-foreground">{t('aboutBody')}</p>
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => {
                s.reset();
                setUuid('');
                toast.success(t('resetDone'));
              }}
            >
              <RotateCcw />
              {t('reset')}
            </Button>
          </Section>
        </div>
      </div>
    </div>
  );
}
