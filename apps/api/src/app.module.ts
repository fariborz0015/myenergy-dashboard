import { Module } from '@nestjs/common';
import { AppliancesModule } from './appliances/appliances';
import { DevicesModule } from './devices/devices.module';
import { HealthController } from './health/health.controller';
import { LiveModule } from './live/live';
import { PrismaModule } from './prisma/prisma.module';
import { SessionsModule } from './sessions/sessions';
import { SettingsModule } from './settings/settings';
import { TelemetryModule } from './telemetry/telemetry.module';

@Module({
  imports: [
    PrismaModule,
    DevicesModule,
    TelemetryModule,
    SessionsModule,
    SettingsModule,
    AppliancesModule,
    LiveModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
