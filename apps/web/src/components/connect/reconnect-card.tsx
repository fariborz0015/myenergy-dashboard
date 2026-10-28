'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BluetoothSearching, LoaderCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deviceConnection } from '@/lib/device/connection';
import { clearLastDevice } from '@/lib/device/last-device';
import { displayName, useDevice } from '@/lib/store/device-store';

/**
 * After a reload Chrome usually won't reconnect without a click, so offer the last station
 * one tap away (the chooser still opens — Web Bluetooth requires it).
 */
export function ReconnectCard({ navigate = true }: { navigate?: boolean }) {
  const t = useTranslations('connect.reconnect');
  const router = useRouter();
  const last = useDevice((s) => s.lastDevice);
  const status = useDevice((s) => s.status);
  const mode = useDevice((s) => s.mode);
  if (!last || last.mode !== 'ble' || mode) return null;
  const busy = status === 'requesting' || status === 'connecting';
  const name = displayName({ bleName: last.name ?? null, deviceSn: null, gatewaySn: null, modelCode: null, deptCode: null, versions: {} });

  return (
    <div className="flex max-w-lg items-center gap-3 rounded-2xl border border-ac/30 bg-ac/8 p-3 ps-4">
      <BluetoothSearching className="size-5 shrink-0 text-ac" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{t('title', { name })}</p>
        <p className="text-xs text-muted-foreground">{t('hint')}</p>
      </div>
      <Button
        size="sm"
        variant="energy"
        disabled={busy}
        onClick={async () => {
          const ok = await deviceConnection.connect('ble');
          if (ok && navigate) router.push('/dashboard');
        }}
      >
        {busy && <LoaderCircle className="animate-spin" />}
        {t('action')}
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t('dismiss')}
        onClick={() => {
          clearLastDevice();
          useDevice.getState().setLastDevice(null);
        }}
      >
        <X />
      </Button>
    </div>
  );
}
