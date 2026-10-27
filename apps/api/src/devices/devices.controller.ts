import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpsertDeviceDto } from './devices.dto';
import { DevicesService } from './devices.service';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post('upsert')
  @ApiOperation({ summary: 'Create or update a device by serial number' })
  upsert(@Body() dto: UpsertDeviceDto) {
    return this.devices.upsert(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List known devices, most recently seen first' })
  list() {
    return this.devices.list();
  }

  @Get(':idOrSn')
  @ApiOperation({ summary: 'Get a device by id or serial number' })
  get(@Param('idOrSn') idOrSn: string) {
    return this.devices.get(idOrSn);
  }
}
