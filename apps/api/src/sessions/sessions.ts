import { Body, Controller, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { DevicesModule } from '../devices/devices.module';
import { DevicesService } from '../devices/devices.service';
import { PrismaService } from '../prisma/prisma.service';

export class StartSessionDto {
  @ApiProperty({ example: 'YC1K24A0019' })
  @IsString()
  @MaxLength(64)
  deviceSn!: string;

  @ApiPropertyOptional({ enum: ['ble', 'demo'], default: 'ble' })
  @IsOptional()
  @IsIn(['ble', 'demo'])
  transport?: 'ble' | 'demo';
}

export class UpdateSessionDto {
  @ApiPropertyOptional({ description: 'Energy into the battery during the session (Wh)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  whIn?: number;

  @ApiPropertyOptional({ description: 'Energy delivered by the outputs during the session (Wh)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  whOut?: number;

  @ApiPropertyOptional({ description: 'Mark the session as ended now' })
  @IsOptional()
  @IsBoolean()
  ended?: boolean;
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: DevicesService,
  ) {}

  async start(dto: StartSessionDto) {
    const device = await this.prisma.device.upsert({
      where: { sn: dto.deviceSn },
      create: { sn: dto.deviceSn },
      update: { lastSeenAt: new Date() },
    });
    return this.prisma.session.create({ data: { deviceId: device.id, transport: dto.transport ?? 'ble' } });
  }

  update(id: string, dto: UpdateSessionDto) {
    return this.prisma.session.update({
      where: { id },
      data: {
        whIn: dto.whIn,
        whOut: dto.whOut,
        endedAt: dto.ended ? new Date() : undefined,
      },
    });
  }

  async list(deviceId?: string) {
    const where = deviceId ? { deviceId: (await this.devices.resolve(deviceId)).id } : {};
    return this.prisma.session.findMany({ where, orderBy: { startedAt: 'desc' }, take: 100 });
  }
}

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Start a connection session' })
  start(@Body() dto: StartSessionDto) {
    return this.sessions.start(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update the energy counters of a session and/or end it' })
  update(@Param('id') id: string, @Body() dto: UpdateSessionDto) {
    return this.sessions.update(id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Recent sessions, optionally for one device (id or serial)' })
  list(@Query('deviceId') deviceId?: string) {
    return this.sessions.list(deviceId);
  }
}

@Module({
  imports: [DevicesModule],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
