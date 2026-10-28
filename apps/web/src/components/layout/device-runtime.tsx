'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { deviceConnection } from '@/lib/device/connection';
import { startSync } from '@/lib/device/sync';
import { useActiveAlerts } from '@/lib/hooks/use-alerts';
import { useFmt } from '@/lib/format';

/** Mounted once: background API sync and alert toasts. */
export function DeviceRuntime() {
  useEffect(() => startSync(), []);
  useEffect(() => {
    void deviceConnection.resume();
  }, []);
  useAlertToasts();
  return null;
}

function useAlertToasts() {
  const alerts = useActiveAlerts();
  const t = useTranslations('alerts');
  const fmt = useFmt();
  const shown = useRef(new Set<string>());

  useEffect(() => {
    const current = new Set(alerts.map((a) => a.kind));
    for (const a of alerts) {
      if (shown.current.has(a.kind)) continue;
      shown.current.add(a.kind);
      const value = a.kind === 'tempHigh' ? fmt.temp(a.value) : a.kind === 'inputOverLimit' ? fmt.watts(a.value) : fmt.pct(a.value);
      const opts = { description: t(`${a.kind}.body`, { value, limit: fmt.watts(a.threshold) }), duration: 8000 };
      if (a.level === 'critical') toast.error(t(`${a.kind}.title`), opts);
      else toast.warning(t(`${a.kind}.title`), opts);
    }
    // Allow an alert to toast again after it has cleared.
    for (const k of [...shown.current]) if (!current.has(k as never)) shown.current.delete(k);
  }, [alerts, fmt, t]);
}
