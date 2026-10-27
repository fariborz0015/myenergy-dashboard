'use client';

import { io, type Socket } from 'socket.io-client';
import { API_URL } from './api';

let socket: Socket | null = null;

/** Lazily-created Socket.IO connection to the API's `/live` namespace. */
export function liveSocket(): Socket {
  if (!socket) {
    socket = io(`${API_URL}/live`, {
      transports: ['websocket'],
      reconnectionDelayMax: 10_000,
      timeout: 5000,
    });
  }
  return socket;
}

export function publishLive(sn: string, name: string, transport: string, snapshot: unknown): void {
  const s = liveSocket();
  if (s.connected) s.emit('telemetry', { sn, name, transport, snapshot });
}

export interface LiveMessage<T> {
  sn: string;
  name: string | null;
  ts: number;
  snapshot: T;
}

/** Subscribe to a device room. Returns an unsubscribe function. */
export function watchLive<T>(sn: string, onTelemetry: (m: LiveMessage<T>) => void, onOffline: () => void): () => void {
  const s = liveSocket();
  const join = () => s.emit('subscribe', { sn });
  const tel = (m: LiveMessage<T>) => m.sn === sn && onTelemetry(m);
  const off = (m: { sn: string }) => m.sn === sn && onOffline();
  s.on('connect', join);
  s.on('telemetry', tel);
  s.on('offline', off);
  if (s.connected) join();
  return () => {
    s.emit('unsubscribe', { sn });
    s.off('connect', join);
    s.off('telemetry', tel);
    s.off('offline', off);
  };
}
