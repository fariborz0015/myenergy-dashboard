import { Body, Controller, Delete, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TelemetryBatchDto, TelemetryQueryDto } from './telemetry.dto';
import { TelemetryService } from './telemetry.service';

@ApiTags('telemetry')
@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: 'Ingest a batch of 1 Hz samples (the browser sends one every ~5 s)' })
  ingest(@Body() dto: TelemetryBatchDto) {
    return this.telemetry.ingest(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Downsampled history with an energy summary for the range' })
  query(@Query() q: TelemetryQueryDto) {
    return this.telemetry.query(q);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all stored telemetry of a device' })
  @ApiQuery({ name: 'deviceId', description: 'Device id or serial number' })
  clear(@Query('deviceId') deviceId: string) {
    return this.telemetry.clear(deviceId);
  }
}
