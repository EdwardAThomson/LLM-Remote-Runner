import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { mountDocsSession } from './auth/docs-session';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const corsOrigins =
    configService.get<string[]>('app.corsOrigins', []) ?? [];

  app.enableCors({
    origin: corsOrigins.length === 0 ? false : corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.setGlobalPrefix('api');

  mountDocsSession(app, app.get(AuthService));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('LLM Remote Runner')
    .setDescription(
      'HTTP API for running prompts against multiple LLM backends. Authenticate with a JWT (web/CLI login) or an API token (`rrt_<id>_<secret>`).',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT or rrt_<id>_<secret>',
      },
      'bearer',
    )
    .addTag('tasks', 'Create, inspect, stream, and delete tasks.')
    .addTag('auth', 'Password login and session inspection.')
    .addTag('tokens', 'Mint, list, and revoke long-lived API tokens.')
    .addTag('health', 'Backend availability probe.')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs/json',
  });

  const port = configService.get<number>('app.port', 3000);

  await app.listen(port);
  Logger.log(`Gateway listening on port ${port}`, 'Bootstrap');
  Logger.log(
    `OpenAPI docs at /api/docs (JSON at /api/docs/json)`,
    'Bootstrap',
  );
}

bootstrap().catch((error) => {
  Logger.error(error, 'Bootstrap');
  process.exit(1);
});
