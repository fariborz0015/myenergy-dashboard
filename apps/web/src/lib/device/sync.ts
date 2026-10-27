'use client';

import { presetForModel, switchesToBitmap } from '@myenergy/protocol';
import { api, checkApi, useApi, type TelemetrySampleIn } from '@/lib/api';
import { publishLive } from '@/lib/live';
import { displayName, useDevice } from '@/lib/store/device-store';
import { resolveCapacity, useSettings } from '@/lib/store/settings-store';
import type { LiveSnapshot } from './connection';

const SAMPLE_MS = 1000;
const FLUSH_MS = 5000;
const SESSION_MS = 30_000;
const HEALTH_MS = 30_000;
const MAX_BUFFER = 900;

/**
 * Background sync while a local device (BLE or demo) is connected:
 *  - 1 Hz samples batched to `POST /telemetry` every 5 s (kept in memory while offline)
 *  - device upsert + session start/update/end
 *  - live snapshot to the `/live` Socket.IO namespace for other tabs / phones
 * Everything is best-effort: the dashboard never depends on the API.
 */
export function startSync(): () => void {
  let buffer: TelemetrySampleIn[] = [];
  let registeredSn: string | null = null;
  let sessionId: string | null = null;
  let flushing = false;

  const enabled = () => useSettings.getState().cloudSync;
  const local = () => {
    const s = useDevice.getState();
    return s.status === 'connected' && (s.mode === 'ble' || s.mode === 'demo') ? s : null;
  };

  const health = async () => {
    await checkApi();
  };

  const sample = () => {
    const s = local();
    if (!s) return;
    const t = s.telemetry;
    if (t.soc === null || !t.power) return;
    const p = t.power;
    buffer.push({
      ts: Date.now(),
      soc: t.soc,
      tempC: t.tempC,
      inW: p.inputW,
      outW: p.outputW,
      acInW: p.acInputW,
      dcInW: p.dcInputW,
      acOutW: p.acOutputW,
      dcOutW: p.dcOutputW,
      usbAW: p.usbAW,
      usbCW: p.usbCW,
      carW: p.carW,
      wirelessW: p.wirelessW,
      switches: t.switches ? switchesToBitmap(t.switches) : 0,
    });
    if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
    if (enabled() && s.info.deviceSn && useApi.getState().status === 'online') {
      const snapshot: LiveSnapshot = { telemetry: t, info: s.info };
      publishLive(s.info.deviceSn, displayName(s.info), s.mode ?? 'ble', snapshot);
    }
  };

  const register = async (sn: string) => {
    const s = useDevice.getState();
    const settings = useSettings.getState();
    await api.upsertDevice({
      sn,
      name: displayName(s.info),
      ...(s.info.gatewaySn ? { gatewaySn: s.info.gatewaySn } : {}),
      ...(s.info.modelCode ? { modelCode: s.info.modelCode } : {}),
      ...(s.info.deptCode ? { deptCode: s.info.deptCode } : {}),
      capacityWh: resolveCapacity(settings, s.info.modelCode) ?? presetForModel(s.info.modelCode)?.capacityWh,
      versions: s.info.versions,
    });
    const session = await api.startSession(sn, s.mode === 'demo' ? 'demo' : 'ble');
    sessionId = session.id;
    registeredSn = sn;
  };

  const flush = async () => {
    const s = local();
    const sn = s?.info.deviceSn;
    if (!enabled() || flushing || !sn || !buffer.length || useApi.getState().status === 'offline') return;
    flushing = true;
    try {
      if (registeredSn !== sn) await register(sn);
      const batch = buffer;
      buffer = [];
      try {
        await api.postTelemetry(sn, batch);
      } catch (e) {
        buffer = [...batch, ...buffer].slice(-MAX_BUFFER);
        throw e;
      }
    } catch {
      // offline: keep buffering, health check will flip the status back
    } finally {
      flushing = false;
    }
  };

  const updateSession = (ended = false) => {
    if (!sessionId || !enabled()) return;
    const { whIn, whOut } = useDevice.getState().session;
    const id = sessionId;
    if (ended) {
      sessionId = null;
      registeredSn = null;
    }
    api.updateSession(id, { whIn: Math.round(whIn * 100) / 100, whOut: Math.round(whOut * 100) / 100, ended }).catch(() => undefined);
  };

  // End the session when the device disconnects or the tab closes.
  const unsub = useDevice.subscribe((s, prev) => {
    if (prev.status === 'connected' && s.status !== 'connected' && s.status !== 'reconnecting') {
      updateSession(true);
      buffer = [];
    }
  });
  const onUnload = () => updateSession(true);
  window.addEventListener('pagehide', onUnload);

  // Mirror user settings to the API (debounced).
  let settingsTimer: ReturnType<typeof setTimeout> | null = null;
  const unsubSettings = useSettings.subscribe((st) => {
    if (settingsTimer) clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => {
      if (!st.cloudSync || useApi.getState().status !== 'online') return;
      const { update: _u, reset: _r, capacityWh, cloudSync: _c, ...rest } = st;
      api.putSettings({ ...rest, ...(capacityWh !== null ? { capacityWh } : {}) }).catch(() => undefined);
    }, 1000);
  });

  void health();
  const timers = [
    setInterval(sample, SAMPLE_MS),
    setInterval(() => void flush(), FLUSH_MS),
    setInterval(() => updateSession(false), SESSION_MS),
    setInterval(() => void health(), HEALTH_MS),
  ];

  return () => {
    timers.forEach(clearInterval);
    unsub();
    unsubSettings();
    if (settingsTimer) clearTimeout(settingsTimer);
    window.removeEventListener('pagehide', onUnload);
  };
}
