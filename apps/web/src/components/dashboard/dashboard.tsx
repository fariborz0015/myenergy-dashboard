'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Activity,
  Bluetooth,
  Eye,
  Info,
  LoaderCircle,
  LogOut,
  PlugZap,
  RefreshCw,
  SlidersHorizontal,
  Wifi,
} from 'lucide-react';
import { StatusDot } from '@/components/layout/connection-pill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { deviceConnection } from '@/lib/device/connection';
import { useFmt } from '@/lib/format';
import { displayName, useDevice } from '@/lib/store/device-store';
import { AlertsBanner } from './alerts-banner';
import { ControlsSheet } from './controls-sheet';
import { DemoPanel } from './demo-panel';
import { DetailsDialog } from './details-dialog';
import { EnergyCounters } from './energy-counters';
import { EnergyFlow } from './energy-flow';
import { PowerSparkline } from './power-sparkline';
import { RailCards } from './rail-cards';
import { RawConsole } from './raw-console';
import { SocHero } from './soc-hero';
import { WifiDialog } from './wifi-dialog';

const item = (i: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay: 0.05 * i, ease: [0.2, 0.7, 0.2, 1] as const },
});

export function Dashboard() {
  const status = useDevice((s) => s.status);
  const mode = useDevice((s) => s.mode);
  const hasData = useDevice((s) => s.telemetry.soc !== null && s.telemetry.power !== null);

  const active = status === 'requesting' || status === 'connecting' || status === 'connected' || status === 'reconnecting';
  if (!mode) return <EmptyState />;
  if (!hasData) return active ? <Loading /> : <EmptyState />;
  return <Live />;
}

function Live() {
  const [controls, setControls] = useState(false);
  const [wifi, setWifi] = useState(false);
  const [details, setDetails] = useState(false);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <Toolbar onControls={() => setControls(true)} onWifi={() => setWifi(true)} onDetails={() => setDetails(true)} />
      <ConnectionBanner />
      <AlertsBanner />
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <motion.div {...item(0)}>
          <SocHero />
        </motion.div>
        <motion.div {...item(1)}>
          <EnergyFlow />
        </motion.div>
      </div>
      <motion.div {...item(2)}>
        <RailCards />
      </motion.div>
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1fr_minmax(280px,380px)]">
        <motion.div {...item(3)}>
          <PowerSparkline />
        </motion.div>
        <motion.div {...item(4)}>
          <EnergyCounters />
        </motion.div>
      </div>
      <DemoPanel />
      <RawConsole />
      <ControlsSheet open={controls} onOpenChange={setControls} />
      <WifiDialog open={wifi} onOpenChange={setWifi} />
      <DetailsDialog open={details} onOpenChange={setDetails} />
    </div>
  );
}

function Toolbar({ onControls, onWifi, onDetails }: { onControls: () => void; onWifi: () => void; onDetails: () => void }) {
  const t = useTranslations('dashboard');
  const ts = useTranslations('status');
  const td = useTranslations('demo');
  const info = useDevice((s) => s.info);
  const status = useDevice((s) => s.status);
  const mode = useDevice((s) => s.mode);
  const watch = mode === 'watch';
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await deviceConnection.refresh();
      toast.success(t('refreshed'));
    } catch (e) {
      toast.error(t('commandFailed', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setRefreshing(false);
    }
  };

  const actions = [
    { key: 'controls', icon: SlidersHorizontal, label: t('controls'), onClick: onControls, primary: true, hidden: false },
    { key: 'refresh', icon: refreshing ? LoaderCircle : RefreshCw, label: t('refresh'), onClick: refresh, hidden: watch, spin: refreshing },
    { key: 'wifi', icon: Wifi, label: t('wifi'), onClick: onWifi, hidden: watch },
    { key: 'details', icon: Info, label: t('details'), onClick: onDetails, hidden: false },
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StatusDot status={status} />
          <span>{ts(status === 'reconnecting' ? 'connecting' : status)}</span>
          {mode === 'demo' && <Badge tone="dc">{td('badge')}</Badge>}
          {mode === 'ble' && (
            <Badge tone="ac">
              <Bluetooth />
              {ts('ble')}
            </Badge>
          )}
          {watch && (
            <Badge tone="ac">
              <Eye />
              {ts('watch')}
            </Badge>
          )}
          <Freshness />
        </div>
        <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{displayName(info)}</h1>
        {info.deviceSn && <p className="font-mono text-xs text-muted-foreground">{info.deviceSn}</p>}
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {actions
          .filter((a) => !a.hidden)
          .map((a) => (
            <Button key={a.key} variant={a.primary ? 'energy' : 'outline'} size="sm" className="h-9 shrink-0 px-3" onClick={a.onClick}>
              <a.icon className={a.spin ? 'animate-spin' : undefined} />
              {a.label}
            </Button>
          ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="size-9 shrink-0" aria-label={t('disconnect')} onClick={() => deviceConnection.disconnect()}>
              <LogOut className="rtl:rotate-180" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('disconnect')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

/** "Live" pill, or a warning when frames stop arriving. */
function Freshness() {
  const t = useTranslations('dashboard');
  const fmt = useFmt();
  const last = useDevice((s) => s.telemetry.lastFrameAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!last) return null;
  const age = Math.max(0, Math.round((now - last) / 1000));
  return age > 6 ? (
    <Badge tone="discharge">{t('stale', { seconds: fmt.num(age) })}</Badge>
  ) : (
    <Badge tone="charge">
      <Activity />
      {t('updated')}
    </Badge>
  );
}

function ConnectionBanner() {
  const t = useTranslations('dashboard');
  const ts = useTranslations('status');
  const tc = useTranslations('common');
  const status = useDevice((s) => s.status);
  const mode = useDevice((s) => s.mode);
  const attempt = useDevice((s) => s.reconnectAttempt);
  const error = useDevice((s) => s.error);

  if (mode === 'watch' && status === 'connected') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-ac/30 bg-ac/8 px-4 py-3 text-sm">
        <Eye className="size-4 shrink-0 text-ac" />
        {t('watchOnly')}
      </div>
    );
  }
  if (status === 'reconnecting') {
    return (
      <div role="status" className="flex items-center gap-3 rounded-2xl border border-discharge/30 bg-discharge/10 px-4 py-3 text-sm">
        <LoaderCircle className="size-4 shrink-0 animate-spin text-discharge" />
        <span className="font-medium">{ts('reconnecting', { attempt })}</span>
        {error && <span className="truncate text-muted-foreground">{error}</span>}
      </div>
    );
  }
  if (status === 'disconnected' || status === 'error') {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm sm:flex-row sm:items-center">
        <PlugZap className="size-4 shrink-0 text-danger" />
        <div className="flex-1">
          <span className="font-medium">{ts(status)}</span>
          {error && <span className="text-muted-foreground"> — {error}</span>}
        </div>
        {mode !== 'watch' && (
          <Button size="sm" variant="outline" onClick={() => deviceConnection.connect(mode === 'demo' ? 'demo' : 'ble')}>
            {tc('retry')}
          </Button>
        )}
      </div>
    );
  }
  return null;
}

function EmptyState() {
  const t = useTranslations('dashboard.empty');
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <Card className="w-full max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <div className="relative grid size-20 place-items-center">
            <span className="absolute inset-0 rounded-full bg-ac/15 animate-pulse-ring" />
            <span className="relative grid size-16 place-items-center rounded-full bg-[linear-gradient(135deg,color-mix(in_oklab,var(--ac)_30%,transparent),color-mix(in_oklab,var(--charge)_30%,transparent))]">
              <Bluetooth className="size-7 text-ac" />
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('body')}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="energy" asChild>
              <Link href="/">
                <Bluetooth />
                {t('connect')}
              </Link>
            </Button>
            <Button variant="outline" onClick={() => deviceConnection.connect('demo')} data-testid="empty-demo">
              <Activity className="text-charge" />
              {t('demo')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Loading() {
  const t = useTranslations('dashboard');
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <LoaderCircle className="size-4 animate-spin" />
        {t('waiting')}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <Skeleton className="h-[480px] rounded-2xl" />
        <Skeleton className="h-[480px] rounded-2xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
