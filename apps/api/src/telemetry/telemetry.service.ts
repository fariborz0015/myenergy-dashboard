import { BadRequestException, Injectable } from '@nestjs/common';
import type { TelemetrySample } from '@prisma/client';
import { DevicesService } from '../devices/devices.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BUCKETS,
  bucketize,
  chooseBucket,
  mergeBuckets,
  POWER_FIELDS,
  summarize,
  type SampleLike,
} from './downsample';
import { TelemetryBatchDto, TelemetryQueryDto, TelemetrySampleDto } from './telemetry.dto';

function parseTime(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = /^\d+$/.test(v) ? Number(v) : Date.parse(v);
  if (!Number.isFinite(n)) throw new BadRequestException(`Invalid time: ${v}`);
  return n;
}

function fromDto(s: TelemetrySampleDto): SampleLike {
  const row = { ts: s.ts, soc: s.soc, tempC: s.tempC ?? null, switches: s.switches ?? 0, n: 1 } as SampleLike;
  for (const f of POWER_FIELDS) row[f] = s[f] ?? 0;
  return row;
}

function fromRow(r: TelemetrySample): SampleLike {
  return { ...r, ts: r.ts.getTime() };
}

@Injectable()
export class TelemetryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: DevicesService,
  ) {}

  get storeBucketS(): number {
    return Math.max(1, Number(process.env.TELEMETRY_STORE_BUCKET_S ?? 5));
  }

  /** Average the batch into store buckets and merge them with any rows already stored. */
  async ingest(dto: TelemetryBatchDto): Promise<{ stored: number }> {
    const device = await this.prisma.device.upsert({
      where: { sn: dto.deviceSn },
      create: { sn: dto.deviceSn },
      update: { lastSeenAt: new Date() },
    });
    const buckets = bucketize(dto.samples.map(fromDto), this.storeBucketS);
    const existing = await this.prisma.telemetrySample.findMany({
      where: { deviceId: device.id, ts: { in: buckets.map((b) => new Date(b.ts)) } },
    });
    const byTs = new Map(existing.map((r) => [r.ts.getTime(), fromRow(r)]));
    await this.prisma.$transaction(
      buckets.map((b) => {
        const prev = byTs.get(b.ts);
        const row = prev ? mergeBuckets(prev, b) : b;
        const data = {
          soc: row.soc,
          tempC: row.tempC,
          switches: row.switches,
          n: row.n ?? 1,
          inW: row.inW,
          outW: row.outW,
          acInW: row.acInW,
          dcInW: row.dcInW,
          acOutW: row.acOutW,
          dcOutW: row.dcOutW,
          usbAW: row.usbAW,
          usbCW: row.usbCW,
          carW: row.carW,
          wirelessW: row.wirelessW,
        };
        return this.prisma.telemetrySample.upsert({
          where: { deviceId_ts: { deviceId: device.id, ts: new Date(b.ts) } },
          create: { deviceId: device.id, ts: new Date(b.ts), ...data },
          update: data,
        });
      }),
    );
    return { stored: buckets.length };
  }

  async query(q: TelemetryQueryDto) {
    const device = await this.devices.resolve(q.deviceId);
    const to = parseTime(q.to, Date.now());
    const from = parseTime(q.from, to - 24 * 3600 * 1000);
    if (from >= to) throw new BadRequestException('`from` must be before `to`');
    const bucket = chooseBucket(q.bucket ?? '1m', from, to);
    const rows = await this.prisma.telemetrySample.findMany({
      where: { deviceId: device.id, ts: { gte: new Date(from), lte: new Date(to) } },
      orderBy: { ts: 'asc' },
    });
    const samples = rows.map(fromRow);
    const points = bucketize(samples, BUCKETS[bucket]!).map(({ n: _n, ...p }) => p);
    return {
      device: { id: device.id, sn: device.sn, name: device.name },
      from,
      to,
      bucket,
      points,
      summary: summarize(samples, Math.max(30, this.storeBucketS * 4)),
    };
  }

  async clear(deviceId: string) {
    const device = await this.devices.resolve(deviceId);
    const { count } = await this.prisma.telemetrySample.deleteMany({ where: { deviceId: device.id } });
    return { deleted: count };
  }
}
