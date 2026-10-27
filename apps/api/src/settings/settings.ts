import { Body, Controller, Get, Injectable, Module, Put } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

/** User settings mirrored from the browser. Every field is optional; PUT merges. */
export class SettingsDto {
  @ApiPropertyOptional({ example: 1024 }) @IsOptional() @IsNumber() @Min(50) @Max(100000)
  capacityWh?: number;

  @ApiPropertyOptional({ example: 0.9 }) @IsOptional() @IsNumber() @Min(0.1) @Max(1)
  usableFactor?: number;

  @ApiPropertyOptional({ example: 0.88 }) @IsOptional() @IsNumber() @Min(0.1) @Max(1)
  effAc?: number;

  @ApiPropertyOptional({ example: 0.95 }) @IsOptional() @IsNumber() @Min(0.1) @Max(1)
  effDc?: number;

  @ApiPropertyOptional({ example: 1000 }) @IsOptional() @IsNumber() @Min(50) @Max(10000)
  ratedOutputW?: number;

  @ApiPropertyOptional({ example: 20 }) @IsOptional() @IsNumber() @Min(1) @Max(99)
  socLow?: number;

  @ApiPropertyOptional({ example: 10 }) @IsOptional() @IsNumber() @Min(1) @Max(99)
  socCritical?: number;

  @ApiPropertyOptional({ example: 45 }) @IsOptional() @IsNumber() @Min(20) @Max(90)
  tempHighC?: number;

  @ApiPropertyOptional({ enum: ['c', 'f'] }) @IsOptional() @IsIn(['c', 'f'])
  tempUnit?: 'c' | 'f';

  @ApiPropertyOptional({ enum: ['dark', 'light', 'system'] }) @IsOptional() @IsIn(['dark', 'light', 'system'])
  theme?: 'dark' | 'light' | 'system';

  @ApiPropertyOptional({ enum: ['en', 'fa'] }) @IsOptional() @IsIn(['en', 'fa'])
  locale?: 'en' | 'fa';

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  persianDigits?: boolean;

  @ApiPropertyOptional({ example: '0000fff0-0000-1000-8000-00805f9b34fb' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  @Matches(/^$|^(0x)?[0-9a-fA-F]{4}$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
  customServiceUuid?: string;
}

const KEY = 'user';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<SettingsDto> {
    const row = await this.prisma.setting.findUnique({ where: { key: KEY } });
    if (!row) return {};
    try {
      return JSON.parse(row.value) as SettingsDto;
    } catch {
      return {};
    }
  }

  async put(patch: SettingsDto): Promise<SettingsDto> {
    // DTO instances carry every declared key, unset ones as undefined — don't let those erase values.
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const merged = { ...(await this.get()), ...defined };
    await this.prisma.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: JSON.stringify(merged) },
      update: { value: JSON.stringify(merged) },
    });
    return merged;
  }
}

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get user settings' })
  get() {
    return this.settings.get();
  }

  @Put()
  @ApiOperation({ summary: 'Merge user settings (unknown keys are stripped)' })
  put(@Body() dto: SettingsDto) {
    return this.settings.put(dto);
  }
}

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
