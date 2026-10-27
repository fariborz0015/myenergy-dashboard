'use client';

import { create } from 'zustand';
import type { Appliance } from '@myenergy/protocol';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export type ApiStatus = 'unknown' | 'online' | 'offline';

export const useApi = create<{ status: ApiStatus; checkedAt: number | null; setStatus: (s: ApiStatus) => void }>()((set) => ({
  status: 'unknown',
  checkedAt: null,
  setStatus: (status) => set({ status, checkedAt: Date.now() }),
}));

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 6000, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: { 'Content-Type': 'application/json', ...(rest.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    useApi.getState().setStatus('offline');
    throw new ApiError(e instanceof Error ? e.message : 'Network error', 0);
  }
  if (useApi.getState().status !== 'online') useApi.getState().setStatus('online');
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      msg = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? msg);
    } catch {
      // ignore
    }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function checkApi(): Promise<boolean> {
  try {
    await request('/health', { timeoutMs: 2500 });
    return true;
  } catch {
    return false;
  }
}

export interface ApiDevice {
  id: string;
  sn: string;
  name: string | null;
  modelCode: string | null;
  capacityWh: number | null;
  lastSeenAt: string;
}

export interface TelemetrySampleIn {
  ts: number;
  soc: number;
  tempC: number | null;
  inW: number;
  outW: number;
  acInW: number;
  dcInW: number;
  acOutW: number;
  dcOutW: number;
  usbAW: number;
  usbCW: number;
  carW: number;
  wirelessW: number;
  switches: number;
}

export type TelemetryPoint = Omit<TelemetrySampleIn, 'tempC'> & { tempC: number | null };

export interface TelemetryResponse {
  device: { id: string; sn: string; name: string | null };
  from: number;
  to: number;
  bucket: string;
  points: TelemetryPoint[];
  summary: {
    whIn: number;
    whOut: number;
    socStart: number | null;
    socEnd: number | null;
    peakInW: number;
    peakOutW: number;
    avgTempC: number | null;
  };
}

export type ApiAppliance = Appliance & { sortOrder?: number };

export const api = {
  upsertDevice: (body: Record<string, unknown>) => request<ApiDevice>('/devices/upsert', { method: 'POST', body: JSON.stringify(body) }),
  devices: () => request<ApiDevice[]>('/devices'),
  postTelemetry: (deviceSn: string, samples: TelemetrySampleIn[]) =>
    request<{ stored: number }>('/telemetry', { method: 'POST', body: JSON.stringify({ deviceSn, samples }) }),
  telemetry: (deviceId: string, from: number, to: number, bucket: string) =>
    request<TelemetryResponse>(`/telemetry?${new URLSearchParams({ deviceId, from: String(from), to: String(to), bucket })}`),
  startSession: (deviceSn: string, transport: 'ble' | 'demo') =>
    request<{ id: string }>('/sessions', { method: 'POST', body: JSON.stringify({ deviceSn, transport }) }),
  updateSession: (id: string, body: { whIn: number; whOut: number; ended?: boolean }) =>
    request<unknown>(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(body), keepalive: true }),
  putSettings: (body: Record<string, unknown>) => request<unknown>('/settings', { method: 'PUT', body: JSON.stringify(body) }),
  appliances: () => request<ApiAppliance[]>('/appliances'),
  createAppliance: (a: Omit<Appliance, 'id'>) => request<ApiAppliance>('/appliances', { method: 'POST', body: JSON.stringify(a) }),
  updateAppliance: (id: string, a: Partial<Omit<Appliance, 'id'>>) =>
    request<ApiAppliance>(`/appliances/${id}`, { method: 'PATCH', body: JSON.stringify(a) }),
  deleteAppliance: (id: string) => request<void>(`/appliances/${id}`, { method: 'DELETE' }),
  liveDevices: () => request<{ sn: string; name: string | null; transport: string | null; lastTs: number }[]>('/live/devices'),
};
