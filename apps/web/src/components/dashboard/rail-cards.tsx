'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Car, Hourglass, LoaderCircle, Plug, Plug2, Sun, Usb, Wifi, Zap, type LucideIcon } from 'lucide-react';
import type { SwitchName } from '@myenergy/protocol';
import { AnimatedNumber } from '@/components/animated-number';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { deviceConnection } from '@/lib/device/connection';
import { useFmt } from '@/lib/format';
import { useEnergy } from '@/lib/hooks/use-energy';
import { effectiveSwitches, PENDING_TTL_MS, useDevice } from '@/lib/store/device-store';
import { cn } from '@/lib/utils';

type Tone = 'ac' | 'dc' | 'usb';

function useSwitch(name: SwitchName) {
  const telemetry = useDevice((s) => s.telemetry);
  const pending = useDevice((s) => s.pending);
  const status = useDevice((s) => s.status);
  const mode = useDevice((s) => s.mode);
  const sw = effectiveSwitches({ telemetry, pending });
  const p = pending[name];
  return {
    on: sw?.[name] ?? false,
    known: !!sw,
    pending: !!p && Date.now() - p.sentAt < PENDING_TTL_MS,
    disabled: status !== 'connected' || mode === 'watch' || !sw,
  };
}

export function RailCards() {
  const t = useTranslations('dashboard');
  const fmt = useFmt();
  const power = useDevice((s) => s.telemetry.power);
  const timers = useDevice((s) => s.telemetry.timersRemaining);
  const timersSet = useDevice((s) => s.telemetry.timersSet);
  const e = useEnergy();
  const usbPorts = power?.usbCPortsW ?? [];

  const timerChip = (key: 'acAutoOff' | 'dcAutoOff' | 'usbAutoOff') =>
    timersSet?.[key] && timers?.[key] ? fmt.duration(timers[key] / 60) : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <RailCard
        name="acOutput"
        tone="ac"
        icon={Plug2}
        title={t('rails.ac')}
        watts={power?.acOutputW ?? null}
        runtime={e.perRail.ac}
        timer={timerChip('acAutoOff')}
        parts={[{ icon: Plug2, label: t('acOut'), w: power?.acOutputW ?? 0 }]}
      />
      <RailCard
        name="dcOutput"
        tone="dc"
        icon={Zap}
        title={t('rails.dc')}
        watts={power ? power.dcOutputW + power.carW : null}
        runtime={e.perRail.dc}
        timer={timerChip('dcAutoOff')}
        parts={[
          { icon: Zap, label: t('dcOut'), w: power?.dcOutputW ?? 0 },
          { icon: Car, label: t('car'), w: power?.carW ?? 0 },
        ]}
      />
      <RailCard
        name="usbOutput"
        tone="usb"
        icon={Usb}
        title={t('rails.usb')}
        watts={power ? power.usbAW + power.usbCW + power.wirelessW : null}
        runtime={e.perRail.usb}
        timer={timerChip('usbAutoOff')}
        parts={[
          { icon: Usb, label: t('usbA'), w: power?.usbAW ?? 0 },
          ...(usbPorts.length ? usbPorts.map((w, i) => ({ icon: Usb, label: `${t('usbC')}${usbPorts.length > 1 ? ` ${fmt.num(i + 1)}` : ''}`, w })) : [{ icon: Usb, label: t('usbC'), w: 0 }]),
          { icon: Wifi, label: t('wireless'), w: power?.wirelessW ?? 0 },
        ]}
      />
      <InputsCard />
    </div>
  );
}

function RailCard({
  name,
  tone,
  icon: Icon,
  title,
  watts,
  runtime,
  parts,
  timer,
}: {
  name: SwitchName;
  tone: Tone;
  icon: LucideIcon;
  title: string;
  watts: number | null;
  runtime: number | null;
  parts: { icon: LucideIcon; label: string; w: number }[];
  timer: string | null;
}) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('controls');
  const tu = useTranslations('units');
  const fmt = useFmt();
  const sw = useSwitch(name);
  const id = `switch-${name}`;

  const toggle = async (on: boolean) => {
    try {
      await deviceConnection.setSwitch(name, on);
    } catch (err) {
      toast.error(t('commandFailed', { error: err instanceof Error ? err.message : String(err) }));
    }
  };

  return (
    <Card className={cn('flex flex-col gap-4 p-5 transition-opacity', !sw.on && sw.known && 'opacity-80')}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="flex min-w-0 cursor-pointer items-center gap-2.5">
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-xl transition-colors',
              sw.on ? { ac: 'bg-ac/15 text-ac', dc: 'bg-dc/15 text-dc', usb: 'bg-usb/15 text-usb' }[tone] : 'bg-muted text-muted-foreground',
            )}
          >
            <Icon className="size-[18px]" />
          </span>
          <span className="truncate text-sm font-medium">{title}</span>
        </label>
        <div className="flex items-center gap-2">
          {sw.pending && <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label={t('pending')} />}
          <Switch id={id} tone={tone} checked={sw.on} disabled={sw.disabled} onCheckedChange={toggle} />
        </div>
      </div>

      <div>
        <div className="flex items-baseline gap-1">
          <AnimatedNumber value={watts} format={(v) => fmt.num(Math.round(v))} className="text-3xl font-semibold tracking-tight tabular" />
          <span className="text-sm text-muted-foreground">{tu('w')}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {sw.known && !sw.on ? t('railOff') : runtime === null ? t('noLoad') : t('railRuntime', { value: fmt.duration(runtime) })}
        </p>
      </div>

      <ul className="mt-auto flex flex-wrap gap-1.5">
        {parts.map((p, i) => (
          <li key={i} className={cn('inline-flex items-center gap-1 rounded-lg bg-muted/60 px-2 py-1 text-[11px]', p.w > 0 ? 'text-foreground' : 'text-muted-foreground')}>
            <p.icon className="size-3" />
            {p.label}
            <span className="font-medium tabular">{fmt.watts(p.w)}</span>
          </li>
        ))}
        {timer && (
          <li>
            <Badge tone="neutral" className="py-1">
              <Hourglass />
              {tc('remaining', { value: timer })}
            </Badge>
          </li>
        )}
      </ul>
    </Card>
  );
}

function InputsCard() {
  const t = useTranslations('dashboard');
  const tc = useTranslations('controls');
  const tu = useTranslations('units');
  const fmt = useFmt();
  const power = useDevice((s) => s.telemetry.power);
  const switches = useDevice((s) => s.telemetry.switches);
  const limit = useDevice((s) => s.telemetry.chargeLimitW);
  const rows = [
    { icon: Plug, label: t('acIn'), w: power?.acInputW ?? 0, plugged: switches?.acChargerConnected, tone: 'text-ac bg-ac/15' },
    { icon: Sun, label: t('dcIn'), w: power?.dcInputW ?? 0, plugged: switches?.dcChargerConnected, tone: 'text-solar bg-solar/15' },
  ];
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2.5 text-sm font-medium">
          <span className="grid size-9 place-items-center rounded-xl bg-charge/15 text-charge">
            <Zap className="size-[18px]" />
          </span>
          {t('rails.inputs')}
        </span>
        {limit !== null && (
          <Badge tone="charge">
            ≤ {fmt.watts(limit)}
          </Badge>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <AnimatedNumber value={power?.inputW ?? null} format={(v) => fmt.num(Math.round(v))} className="text-3xl font-semibold tracking-tight tabular" />
        <span className="text-sm text-muted-foreground">{tu('w')}</span>
      </div>
      <ul className="mt-auto flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-2.5 py-2">
            <span className={cn('grid size-7 place-items-center rounded-lg', r.tone)}>
              <r.icon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs">{r.label}</span>
              <span className="block text-[11px] text-muted-foreground">{r.plugged ? t('connectedCharger') : t('noCharger')}</span>
            </span>
            <span className="text-sm font-semibold tabular">{fmt.watts(r.w)}</span>
          </li>
        ))}
      </ul>
      <span className="sr-only">{tc('chargeLimit')}</span>
    </Card>
  );
}
