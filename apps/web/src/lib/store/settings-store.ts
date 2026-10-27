'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_ALERT_THRESHOLDS, DEFAULT_ENERGY_CONFIG, presetForModel, type EnergyConfig } from '@myenergy/protocol';

export interface Settings {
  /** `null` = take it from the model preset (or the 1024 Wh default). */
  capacityWh: number | null;
  usableFactor: number;
  effAc: number;
  effDc: number;
  ratedOutputW: number;
  socLow: number;
  socCritical: number;
  tempHighC: number;
  tempUnit: 'c' | 'f';
  persianDigits: boolean;
  /** Extra GATT service UUIDs for `optionalServices`: comma-separated 16-bit hex or full UUIDs. */
  customServiceUuid: string;
  /** Mirror telemetry to the API when it is reachable. */
  cloudSync: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  capacityWh: null,
  usableFactor: DEFAULT_ENERGY_CONFIG.usableFactor,
  effAc: DEFAULT_ENERGY_CONFIG.effAc,
  effDc: DEFAULT_ENERGY_CONFIG.effDc,
  ratedOutputW: 1000,
  socLow: DEFAULT_ALERT_THRESHOLDS.socLow,
  socCritical: DEFAULT_ALERT_THRESHOLDS.socCritical,
  tempHighC: DEFAULT_ALERT_THRESHOLDS.tempHighC,
  tempUnit: 'c',
  persianDigits: true,
  customServiceUuid: '',
  cloudSync: true,
};

interface SettingsStore extends Settings {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'myenergy-settings',
      version: 2,
      // v2: the BMS SOC already excludes the reserve, so the old 0.9 default double-counted it.
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<Settings>;
        if (version < 2 && s.usableFactor === 0.9) s.usableFactor = 1;
        return s as SettingsStore;
      },
    },
  ),
);

export function resolveCapacity(s: Pick<Settings, 'capacityWh'>, modelCode: string | null | undefined): number {
  return s.capacityWh ?? presetForModel(modelCode)?.capacityWh ?? DEFAULT_ENERGY_CONFIG.capacityWh;
}

export function energyConfigOf(s: Settings, modelCode: string | null | undefined): EnergyConfig {
  return {
    capacityWh: resolveCapacity(s, modelCode),
    usableFactor: s.usableFactor,
    effAc: s.effAc,
    effDc: s.effDc,
  };
}
