'use client';

import { useMemo } from 'react';
import { evaluateAlerts, type EnergyAlert } from '@myenergy/protocol';
import { useDevice } from '@/lib/store/device-store';
import { useSettings } from '@/lib/store/settings-store';

export function useActiveAlerts(): EnergyAlert[] {
  const connected = useDevice((s) => s.status === 'connected');
  const soc = useDevice((s) => s.telemetry.soc);
  const tempC = useDevice((s) => s.telemetry.tempC);
  const inputW = useDevice((s) => s.telemetry.power?.inputW ?? null);
  const chargeLimitW = useDevice((s) => s.telemetry.chargeLimitW);
  const socLow = useSettings((s) => s.socLow);
  const socCritical = useSettings((s) => s.socCritical);
  const tempHighC = useSettings((s) => s.tempHighC);
  return useMemo(
    () => (connected ? evaluateAlerts({ soc, tempC, inputW, chargeLimitW }, { socLow, socCritical, tempHighC }) : []),
    [connected, soc, tempC, inputW, chargeLimitW, socLow, socCritical, tempHighC],
  );
}
