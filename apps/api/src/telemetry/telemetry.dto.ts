import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BUCKETS } from './downsample';

const MAX_W = 100000;

export class TelemetrySampleDto {
  @ApiProperty({ description: 'Epoch milliseconds', example: 1761600000000 })
  @IsInt()
  @Min(0)
  ts!: number;

  @ApiProperty({ example: 76 })
  @IsNumber()
  @Min(0)
  @Max(100)
  soc!: number;

  @ApiPropertyOptional({ example: 27.4, nullable: true, type: Number })
  @IsOptional()
  @IsNumber()
  @Min(-60)
  @Max(150)
  tempC?: number | null;

  @ApiProperty() @IsNumber() @Min(0) @Max(MAX_W) inW!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(MAX_W) outW!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(MAX_W) acInW?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(MAX_W) dcInW?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(MAX_W) acOutW?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(MAX_W) dcOutW?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(MAX_W) usbAW?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(MAX_W) usbCW?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(MAX_W) carW?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(MAX_W) wirelessW?: number;

  @ApiPropertyOptional({ description: 'cmd 0x50 bitmap' })
  @IsOptional()
  @IsInt()
  @Min(0)
  switches?: number;
}

export class TelemetryBatchDto {
  @ApiProperty({ example: 'YC1K24A0019', description: 'Device serial number' })
  @IsString()
  @MaxLength(64)
  deviceSn!: string;

  @ApiProperty({ type: [TelemetrySampleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3600)
  @ValidateNested({ each: true })
  @Type(() => TelemetrySampleDto)
  samples!: TelemetrySampleDto[];
}

export class TelemetryQueryDto {
  @ApiProperty({ description: 'Device id or serial number' })
  @IsString()
  deviceId!: string;

  @ApiPropertyOptional({ description: 'ISO date or epoch ms; default now − 24 h' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date or epoch ms; default now' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ enum: Object.keys(BUCKETS), default: '1m' })
  @IsOptional()
  @IsIn(Object.keys(BUCKETS))
  bucket?: string;
}
