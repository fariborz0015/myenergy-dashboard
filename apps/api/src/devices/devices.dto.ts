import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpsertDeviceDto {
  @ApiProperty({ example: 'YC1K24A0019', description: 'Device serial (from 0C or YICHU|SN)' })
  @IsString()
  @MaxLength(64)
  sn!: string;

  @ApiPropertyOptional({ example: 'GW8F3A21C07' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  gatewaySn?: string;

  @ApiPropertyOptional({ example: 'MGI106MG2HEU' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  modelCode?: string;

  @ApiPropertyOptional({ example: '103' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deptCode?: string;

  @ApiPropertyOptional({ example: 'INFINITY 1000 0019' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: 1024 })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(100000)
  capacityWh?: number;

  @ApiPropertyOptional({ example: { mainControlVersion: '1.2.7', bmsVersion: '2.0.3' } })
  @IsOptional()
  @IsObject()
  versions?: Record<string, string>;
}
