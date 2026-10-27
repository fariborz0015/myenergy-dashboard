import { Injectable, NotFoundException } from '@nestjs/common';
import type { Device } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertDeviceDto } from './devices.dto';

export type DeviceView = Omit<Device, 'versions'> & { versions: Record<string, string> | null };

export function toView(d: Device): DeviceView {
  let versions: Record<string, string> | null = null;
  try {
    versions = d.versions ? (JSON.parse(d.versions) as Record<string, string>) : null;
  } catch {
    versions = null;
  }
  return { ...d, versions };
}

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(dto: UpsertDeviceDto): Promise<DeviceView> {
    const { sn, versions, ...rest } = dto;
    const existing = await this.prisma.device.findUnique({ where: { sn } });
    const mergedVersions = versions
      ? JSON.stringify({ ...(existing ? (toView(existing).versions ?? {}) : {}), ...versions })
      : undefined;
    const d = await this.prisma.device.upsert({
      where: { sn },
      create: { sn, ...rest, versions: mergedVersions },
      update: { ...rest, versions: mergedVersions, lastSeenAt: new Date() },
    });
    return toView(d);
  }

  async list(): Promise<DeviceView[]> {
    const all = await this.prisma.device.findMany({ orderBy: { lastSeenAt: 'desc' } });
    return all.map(toView);
  }

  /** Resolve by internal id or serial number. */
  async resolve(idOrSn: string): Promise<Device> {
    const d = await this.prisma.device.findFirst({ where: { OR: [{ id: idOrSn }, { sn: idOrSn }] } });
    if (!d) throw new NotFoundException(`Unknown device ${idOrSn}`);
    return d;
  }

  async get(idOrSn: string): Promise<DeviceView> {
    return toView(await this.resolve(idOrSn));
  }
}
