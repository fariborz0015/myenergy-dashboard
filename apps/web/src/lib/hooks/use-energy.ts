'use client';

import { useMemo } from 'react';
import { netPower, railRuntimes, runtimeHours, timeToFullHours, type RailLoads } from '@myenergy/protocol';
import { useDevice } from '@/lib/store/device-store';
import { energyConfigOf, useSettings } from '@/lib/store/settings-store';

/** Everything the dashboard derives from the latest telemetry + user settings. */
export function useEnergy() {
  const soc = useDevice((s) => s.telemetry.soc);
  const power = useDevice((s) => s.telemetry.power);
  const remainUsableMin = useDevice((s) => s.telemetry.remainUsableMin);
  const modelCode = useDevice((s) => s.info.modelCode);
  const settings = useSettings();

  return useMemo(() => {
    const config = energyConfigOf(settings, modelCode);
    const loads: RailLoads = {
      acW: power?.acOutputW ?? 0,
      dcW: (power?.dcOutputW ?? 0) + (power?.carW ?? 0),
      usbW: (power?.usbAW ?? 0) + (power?.usbCW ?? 0) + (power?.wirelessW ?? 0),
    };
    const inW = power?.inputW ?? 0;
    const outW = power?.outputW ?? 0;
    const net = netPower(inW, outW);
    const runtime = soc === null ? null : runtimeHours(soc, loads, config);
    const perRail = soc === null ? { ac: null, dc: null, usb: null } : railRuntimes(soc, loads, config);
    const toFull = soc === null ? null : timeToFullHours(soc, inW, outW, config);
    const deviceRuntime = remainUsableMin ? remainUsableMin / 60 : null;
    return { config, loads, inW, outW, ...net, runtime, perRail, toFull, deviceRuntime, hasData: soc !== null && !!power };
  }, [soc, power, remainUsableMin, modelCode, settings]);
}
