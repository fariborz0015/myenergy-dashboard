import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { APPLIANCE_PRESETS } from '@myenergy/protocol';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

export class CreateApplianceDto {
  @ApiProperty({ example: 'Fridge' }) @IsString() @MaxLength(60)
  name!: string;

  @ApiProperty({ example: 150 }) @IsNumber() @Min(0.1) @Max(10000)
  watts!: number;

  @ApiPropertyOptional({ example: 35 }) @IsOptional() @IsNumber() @Min(0) @Max(100)
  dutyPct?: number;

  @ApiPropertyOptional({ enum: ['ac', 'dc', 'usb'] }) @IsOptional() @IsIn(['ac', 'dc', 'usb'])
  rail?: 'ac' | 'dc' | 'usb';

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 'refrigerator' }) @IsOptional() @IsString() @MaxLength(40)
  icon?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  sortOrder?: number;
}

export class UpdateApplianceDto extends PartialType(CreateApplianceDto) {}

@Injectable()
export class AppliancesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lists presets, seeding the defaults the first time. */
  async list() {
    if ((await this.prisma.appliancePreset.count()) === 0) {
      await this.prisma.appliancePreset.createMany({
        data: APPLIANCE_PRESETS.map((p, i) => ({
          ...p,
          enabled: ['Fridge', 'Laptop', 'Wi-Fi router', 'Phone'].includes(p.name),
          sortOrder: i,
        })),
      });
    }
    return this.prisma.appliancePreset.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  create(dto: CreateApplianceDto) {
    return this.prisma.appliancePreset.create({ data: { ...dto, sortOrder: dto.sortOrder ?? 1000 } });
  }

  update(id: string, dto: UpdateApplianceDto) {
    return this.prisma.appliancePreset.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.appliancePreset.delete({ where: { id } });
  }
}

@ApiTags('appliances')
@Controller('appliances')
export class AppliancesController {
  constructor(private readonly appliances: AppliancesService) {}

  @Get()
  @ApiOperation({ summary: 'List appliance presets (seeds defaults on first call)' })
  list() {
    return this.appliances.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create an appliance preset' })
  create(@Body() dto: CreateApplianceDto) {
    return this.appliances.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an appliance preset' })
  update(@Param('id') id: string, @Body() dto: UpdateApplianceDto) {
    return this.appliances.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an appliance preset' })
  remove(@Param('id') id: string) {
    return this.appliances.remove(id);
  }
}

@Module({
  controllers: [AppliancesController],
  providers: [AppliancesService],
})
export class AppliancesModule {}
