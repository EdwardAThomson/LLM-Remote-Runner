import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ApiTokensController } from './api-tokens/api-tokens.controller';
import { ApiTokensRepository } from './api-tokens/api-tokens.repository';
import { ApiTokensService } from './api-tokens/api-tokens.service';
import { ApiTokenStrategy } from './api-tokens/api-token.strategy';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('app.jwtSecret');
        const issuer = config.get<string>('app.jwtIssuer');
        if (!secret) {
          throw new Error('JWT secret is not configured');
        }

        return {
          secret,
          signOptions: {
            issuer,
          },
        };
      },
    }),
  ],
  controllers: [AuthController, ApiTokensController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    ApiTokensRepository,
    ApiTokensService,
    ApiTokenStrategy,
  ],
  exports: [JwtModule, JwtAuthGuard, AuthService, ApiTokensService],
})
export class AuthModule {}
