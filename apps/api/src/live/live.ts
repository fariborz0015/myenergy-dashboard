import { Controller, Get, Injectable, Logger, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { webOrigins } from '../common/origins';

export interface LivePublisher {
  sn: string;
  name: string | null;
  transport: string | null;
  publisherId: string;
  lastTs: number;
  snapshot: Record<string, unknown>;
}

const MAX_SNAPSHOT_BYTES = 32 * 1024;
const STALE_MS = 15_000;
export const room = (sn: string) => `device:${sn}`;

/** Latest snapshot per device, kept in memory (live data is ephemeral by design). */
@Injectable()
export class LiveRegistry {
  private readonly publishers = new Map<string, LivePublisher>();

  update(p: LivePublisher) {
    const isNew = !this.publishers.has(p.sn);
    this.publishers.set(p.sn, p);
    return isNew;
  }

  get(sn: string) {
    return this.publishers.get(sn);
  }

  /** Drops every device published by a socket; returns the serials removed. */
  dropPublisher(publisherId: string): string[] {
    const removed: string[] = [];
    for (const [sn, p] of this.publishers) {
      if (p.publisherId === publisherId) {
        this.publishers.delete(sn);
        removed.push(sn);
      }
    }
    return removed;
  }

  list(now = Date.now()) {
    return [...this.publishers.values()]
      .filter((p) => now - p.lastTs < STALE_MS)
      .map(({ sn, name, transport, lastTs }) => ({ sn, name, transport, lastTs }));
  }
}

interface TelemetryMessage {
  sn?: unknown;
  name?: unknown;
  transport?: unknown;
  snapshot?: unknown;
}

/**
 * Namespace `/live`. A browser connected to a device emits `telemetry`
 * `{ sn, name, transport, snapshot }` about once per second; the server re-broadcasts it as
 * `telemetry` to room `device:<sn>`. Watchers emit `subscribe { sn }` to join that room.
 */
@WebSocketGateway({ namespace: '/live', cors: { origin: webOrigins(), credentials: true } })
export class LiveGateway implements OnGatewayDisconnect {
  private readonly logger = new Logger('LiveGateway');
  @WebSocketServer() server!: Namespace;

  constructor(private readonly registry: LiveRegistry) {}

  @SubscribeMessage('subscribe')
  async subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { sn?: unknown }) {
    if (typeof body?.sn !== 'string' || !body.sn) return { ok: false, error: 'sn required' };
    await client.join(room(body.sn));
    const latest = this.registry.get(body.sn);
    if (latest) client.emit('telemetry', { sn: latest.sn, name: latest.name, ts: latest.lastTs, snapshot: latest.snapshot });
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { sn?: unknown }) {
    if (typeof body?.sn === 'string') await client.leave(room(body.sn));
    return { ok: true };
  }

  @SubscribeMessage('devices')
  devices() {
    return this.registry.list();
  }

  @SubscribeMessage('telemetry')
  telemetry(@ConnectedSocket() client: Socket, @MessageBody() body: TelemetryMessage) {
    if (typeof body?.sn !== 'string' || !body.sn || body.sn.length > 64) return { ok: false, error: 'sn required' };
    if (typeof body.snapshot !== 'object' || body.snapshot === null) return { ok: false, error: 'snapshot required' };
    if (JSON.stringify(body.snapshot).length > MAX_SNAPSHOT_BYTES) return { ok: false, error: 'snapshot too large' };
    const ts = Date.now();
    const pub: LivePublisher = {
      sn: body.sn,
      name: typeof body.name === 'string' ? body.name.slice(0, 80) : null,
      transport: typeof body.transport === 'string' ? body.transport.slice(0, 16) : null,
      publisherId: client.id,
      lastTs: ts,
      snapshot: body.snapshot as Record<string, unknown>,
    };
    const isNew = this.registry.update(pub);
    client.to(room(pub.sn)).emit('telemetry', { sn: pub.sn, name: pub.name, ts, snapshot: pub.snapshot });
    if (isNew) this.server.emit('devices', this.registry.list());
    return { ok: true };
  }

  handleDisconnect(client: Socket) {
    const removed = this.registry.dropPublisher(client.id);
    for (const sn of removed) this.server.to(room(sn)).emit('offline', { sn });
    if (removed.length) {
      this.logger.log(`publisher ${client.id} left (${removed.join(', ')})`);
      this.server.emit('devices', this.registry.list());
    }
  }
}

@ApiTags('live')
@Controller('live')
export class LiveController {
  constructor(private readonly registry: LiveRegistry) {}

  @Get('devices')
  @ApiOperation({ summary: 'Devices currently being published by a browser (Socket.IO namespace /live)' })
  devices() {
    return this.registry.list();
  }
}

@Module({
  controllers: [LiveController],
  providers: [LiveRegistry, LiveGateway],
})
export class LiveModule {}
