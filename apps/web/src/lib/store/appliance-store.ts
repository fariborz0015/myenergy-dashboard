'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { APPLIANCE_PRESETS, type Appliance } from '@myenergy/protocol';
import { api, useApi } from '@/lib/api';

const DEFAULT_ON = new Set(['Fridge', 'Laptop', 'Wi-Fi router', 'Phone']);

export function defaultAppliances(): Appliance[] {
  return APPLIANCE_PRESETS.map((p, i) => ({ ...p, id: `local-${i}`, enabled: DEFAULT_ON.has(p.name) }));
}

const isLocal = (id: string) => id.startsWith('local-');
let seq = 0;
const localId = () => `local-${Date.now().toString(36)}-${(seq++).toString(36)}`;

interface ApplianceStore {
  items: Appliance[];
  source: 'local' | 'api';
  /** Load from the API when reachable; push items created while offline. */
  sync: () => Promise<void>;
  add: (a: Omit<Appliance, 'id'>) => void;
  update: (id: string, patch: Partial<Omit<Appliance, 'id'>>) => void;
  remove: (id: string) => void;
  reset: () => Promise<void>;
}

const toAppliance = (a: Appliance): Appliance => ({
  id: a.id,
  name: a.name,
  watts: a.watts,
  dutyPct: a.dutyPct,
  rail: a.rail,
  enabled: a.enabled,
  icon: a.icon ?? undefined,
});

export const useAppliances = create<ApplianceStore>()(
  persist(
    (set, get) => ({
      items: defaultAppliances(),
      source: 'local',

      sync: async () => {
        try {
          let remote = await api.appliances();
          const pending = get().items.filter((a) => isLocal(a.id) && !APPLIANCE_PRESETS.some((p) => p.name === a.name));
          for (const a of pending) {
            const { id: _id, ...body } = a;
            await api.createAppliance(body);
          }
          if (pending.length) remote = await api.appliances();
          set({ items: remote.map(toAppliance), source: 'api' });
        } catch {
          set({ source: 'local' });
        }
      },

      add: (a) => {
        const temp = { ...a, id: localId() };
        set((s) => ({ items: [...s.items, temp] }));
        if (useApi.getState().status === 'online') {
          api
            .createAppliance(a)
            .then((created) => set((s) => ({ items: s.items.map((x) => (x.id === temp.id ? toAppliance(created) : x)) })))
            .catch(() => undefined);
        }
      },

      update: (id, patch) => {
        set((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
        if (!isLocal(id) && useApi.getState().status === 'online') api.updateAppliance(id, patch).catch(() => undefined);
      },

      remove: (id) => {
        set((s) => ({ items: s.items.filter((x) => x.id !== id) }));
        if (!isLocal(id) && useApi.getState().status === 'online') api.deleteAppliance(id).catch(() => undefined);
      },

      reset: async () => {
        const { items, source } = get();
        if (source === 'api' && useApi.getState().status === 'online') {
          try {
            await Promise.all(items.map((a) => api.deleteAppliance(a.id).catch(() => undefined)));
            await get().sync(); // the API re-seeds defaults when empty
            return;
          } catch {
            // fall through to local reset
          }
        }
        set({ items: defaultAppliances(), source: 'local' });
      },
    }),
    { name: 'myenergy-appliances', version: 1, partialize: (s) => ({ items: s.items }) },
  ),
);
