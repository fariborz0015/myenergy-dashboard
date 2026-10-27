import './common/load-env';
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { webOrigins } from './common/origins';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: webOrigins(), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('MyEnergy API')
    .setDescription(
      'Device registry, downsampled telemetry history, sessions, settings and appliance presets ' +
        'for the MyEnergy dashboard. Live telemetry is re-broadcast on the Socket.IO namespace `/live`.',
    )
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  Logger.log(`API on http://localhost:${port} — docs at /docs`, 'Bootstrap');
}

void bootstrap();
