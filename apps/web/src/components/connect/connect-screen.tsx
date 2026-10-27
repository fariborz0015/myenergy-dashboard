'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  Activity,
  ArrowRight,
  Bluetooth,
  BluetoothSearching,
  Calculator,
  Check,
  CircleAlert,
  Copy,
  Eye,
  LoaderCircle,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api, useApi } from '@/lib/api';
import { deviceConnection } from '@/lib/device/connection';
import { useBleSupport } from '@/lib/hooks/use-ble-support';
import { displayName, useDevice } from '@/lib/store/device-store';
import { cn } from '@/lib/utils';
import { HeroVisual } from './hero-visual';

/** CSS entrance animation: runs at first paint, before hydration, and honours reduced motion. */
const fade = (i: number) => ({
  className: 'animate-in fade-in-0 slide-in-from-bottom-3 duration-500 fill-mode-both',
  style: { animationDelay: `${60 * i}ms` },
});

export function ConnectScreen() {
  const t = useTranslations('connect');
  const router = useRouter();
  const support = useBleSupport();
  const status = useDevice((s) => s.status);
  const mode = useDevice((s) => s.mode);
  const error = useDevice((s) => s.error);
  const info = useDevice((s) => s.info);
  const busy = status === 'requesting' || status === 'connecting';
  const bleReady = support.supported && support.secure;

  const connect = async (kind: 'ble' | 'demo', acceptAllDevices = false) => {
    const ok = await deviceConnection.connect(kind, { acceptAllDevices });
    if (ok) router.push('/dashboard');
  };

  return (
    <div className="flex flex-col gap-16 pb-8">
      <section className="grid items-center gap-10 pt-2 lg:grid-cols-[1.1fr_1fr] lg:gap-6 lg:pt-10">
        <div className="flex flex-col gap-6">
          <span className={cn(fade(0).className, 'inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur')} style={fade(0).style}>
            <Sparkles className="size-3.5 text-charge" />
            {t('eyebrow')}
          </span>
          <h1 className={cn(fade(1).className, 'max-w-xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl')} style={fade(1).style}>
            {t('title')}
          </h1>
          <p className={cn(fade(2).className, 'max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg')} style={fade(2).style}>
            {t('subtitle')}
          </p>

          {status === 'connected' && mode !== null ? (
            <div className={fade(3).className} style={fade(3).style}>
              <Card className="max-w-lg">
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-charge/15 text-charge">
                      <Bluetooth className="size-5" />
                    </span>
                    <p className="truncate font-medium">{t('connectedAs', { name: displayName(info) })}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => deviceConnection.disconnect()}>
                      {t('disconnect')}
                    </Button>
                    <Button variant="energy" asChild>
                      <Link href="/dashboard">
                        {t('continue')}
                        <ArrowRight className="rtl:rotate-180" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className={cn(fade(3).className, 'flex flex-col gap-3')} style={fade(3).style}>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  size="xl"
                  variant="energy"
                  disabled={busy || (support.checked && !bleReady)}
                  onClick={() => connect('ble')}
                  className="sm:min-w-64"
                >
                  {busy && mode === 'ble' ? <LoaderCircle className="size-5 animate-spin" /> : <Bluetooth className="size-5" />}
                  {t('bluetooth')}
                </Button>
                <Button size="xl" variant="outline" disabled={busy} onClick={() => connect('demo')} data-testid="demo-button">
                  {busy && mode === 'demo' ? <LoaderCircle className="size-5 animate-spin" /> : <Activity className="size-5 text-charge" />}
                  {t('demo')}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{t('demoHint')}</span>
                {bleReady && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => connect('ble', true)}
                    className="inline-flex items-center gap-1.5 rounded text-ac underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50"
                  >
                    <BluetoothSearching className="size-3.5" />
                    {t('showAll')}
                  </button>
                )}
              </div>
            </div>
          )}

          {status === 'error' && error && <ConnectError message={error} onRetry={() => connect(mode === 'demo' ? 'demo' : 'ble')} />}
          {support.checked && !bleReady && <UnsupportedNotice />}

          <p className={cn(fade(4).className, 'flex max-w-lg items-start gap-2 text-xs text-muted-foreground')} style={fade(4).style}>
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-charge" />
            {t('privacy')}
          </p>
        </div>

        <div className="mx-auto w-full max-w-[320px] animate-in fade-in-0 zoom-in-95 duration-700 fill-mode-both sm:max-w-[440px]">
          <HeroVisual />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {(
          [
            ['live', Activity, 'text-charge bg-charge/12'],
            ['control', SlidersHorizontal, 'text-ac bg-ac/12'],
            ['plan', Calculator, 'text-dc bg-dc/12'],
          ] as const
        ).map(([key, Icon, tone], i) => (
          <motion.div key={key} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
            <Card className="h-full">
              <CardContent className="flex flex-col gap-3">
                <span className={cn('grid size-10 place-items-center rounded-xl', tone)}>
                  <Icon className="size-5" />
                </span>
                <h2 className="font-semibold">{t(`features.${key}.title`)}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{t(`features.${key}.body`)}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <h2 className="font-semibold">{t('steps.title')}</h2>
            <ol className="flex flex-col gap-3">
              {(['one', 'two', 'three'] as const).map((k, i) => (
                <li key={k} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-foreground tabular">{i + 1}</span>
                  <span className="pt-0.5">{t(`steps.${k}`)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <WatchLive />
      </section>
    </div>
  );
}

function ConnectError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useTranslations('connect.error');
  const diag = useDevice((s) => s.bleDiagnostics);
  return (
    <div role="alert" className="flex max-w-lg flex-col gap-3 rounded-2xl border border-danger/30 bg-danger/8 p-4">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium">{diag ? t('noCharTitle') : t('title')}</p>
          <p className="text-sm break-words text-muted-foreground">{diag ? t('noCharBody') : message}</p>
          {!diag && <p className="text-sm text-muted-foreground">{t('help')}</p>}
        </div>
      </div>
      {diag && <BleDiagnosticsPanel diag={diag} />}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="w-fit" onClick={onRetry}>
          {t('retry')}
        </Button>
        {diag && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/settings">{t('openSettings')}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function UuidChips({ list }: { list: string[] }) {
  return (
    <span className="flex flex-wrap gap-1" dir="ltr">
      {list.map((u) => (
        <code key={u} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]">
          {u}
        </code>
      ))}
    </span>
  );
}

function BleDiagnosticsPanel({ diag }: { diag: NonNullable<ReturnType<typeof useDevice.getState>['bleDiagnostics']> }) {
  const t = useTranslations('connect.error');
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText('chrome://bluetooth-internals/#devices');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card/60 p-3 text-sm">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('accessible')}</span>
        {diag.accessible.length ? <UuidChips list={diag.accessible} /> : <span className="text-xs">{t('none')}</span>}
      </div>
      {diag.learned.length > 0 ? (
        <p className="rounded-lg bg-charge/10 px-3 py-2 text-xs text-charge">
          {t('learned')} <UuidChips list={diag.learned} />
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium">{t('findTitle')}</span>
          <ol className="flex list-decimal flex-col gap-1 ps-5 text-xs text-muted-foreground">
            <li>
              {t('find1')}{' '}
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
                dir="ltr"
              >
                chrome://bluetooth-internals
                {copied ? <Check className="size-3 text-charge" /> : <Copy className="size-3" />}
              </button>
            </li>
            <li>{t('find2')}</li>
            <li>{t('find3')}</li>
            <li>{t('find4')}</li>
          </ol>
        </div>
      )}
    </div>
  );
}

function UnsupportedNotice() {
  const t = useTranslations('connect.unsupported');
  const support = useBleSupport();
  return (
    <div role="status" className="flex max-w-lg flex-col gap-2 rounded-2xl border border-discharge/30 bg-discharge/8 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <CircleAlert className="size-4 text-discharge" />
        {t('title')}
      </p>
      <ul className="flex list-disc flex-col gap-1 ps-5 text-muted-foreground">
        {!support.secure && <li>{t('insecure')}</li>}
        {support.ios ? <li>{t('ios')}</li> : <li>{t('browsers')}</li>}
        {support.linux && <li>{t('flag')}</li>}
        <li>{t('demoInstead')}</li>
      </ul>
    </div>
  );
}

function WatchLive() {
  const t = useTranslations('connect.watch');
  const router = useRouter();
  const apiStatus = useApi((s) => s.status);
  const [devices, setDevices] = useState<{ sn: string; name: string | null; transport: string | null }[] | null>(null);

  useEffect(() => {
    if (apiStatus !== 'online') return;
    let alive = true;
    const load = () => api.liveDevices().then((d) => alive && setDevices(d)).catch(() => alive && setDevices([]));
    void load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [apiStatus]);

  if (apiStatus !== 'online') return null;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Eye className="size-4 text-ac" />
            {t('title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('body')}</p>
        </div>
        {devices && devices.length === 0 && <p className="text-sm text-muted-foreground">{t('empty')}</p>}
        <ul className="flex flex-col gap-2">
          {devices?.map((d) => (
            <li key={d.sn} className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{d.name ?? d.sn}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{d.sn}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  deviceConnection.watch(d.sn, d.name);
                  router.push('/dashboard');
                }}
              >
                {t('action')}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
