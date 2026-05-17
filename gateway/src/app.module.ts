import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  ThrottlerModule,
  ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { envValidationSchema } from './config/env.validation';
import appConfig from './config/app.config';
import { DatabaseModule } from './db/database.module';
import { TasksModule } from './tasks/tasks.module';
import { ConversationsModule } from './conversations/conversations.module';
import { AuthModule } from './auth/auth.module';
import { ObservabilityModule } from './observability/observability.module';
import { JwtAuthGuard } from './auth/jwt.guard';
import { PrincipalThrottlerGuard } from './throttler/principal-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: envValidationSchema,
    }),
    ConfigModule.forFeature(appConfig),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      // RATE_LIMIT_DURATION is configured in seconds for readability; the
      // throttler expects milliseconds (semantics changed in @nestjs/throttler v5).
      useFactory: (config: ConfigService): ThrottlerModuleOptions => ({
        throttlers: [
          {
            ttl: (config.get<number>('app.rateLimitDuration', 60) ?? 60) * 1000,
            limit: config.get<number>('app.rateLimitPoints', 60),
          },
        ],
      }),
    }),
    DatabaseModule,
    AuthModule,
    TasksModule,
    ConversationsModule,
    ObservabilityModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PrincipalThrottlerGuard,
    },
  ],
})
export class AppModule {}
