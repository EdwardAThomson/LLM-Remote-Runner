import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtUser } from './jwt-user.interface';

function extractTokenFromQuery(req: Request): string | null {
  if (!req || !req.query) {
    return null;
  }

  const value = req.query.token ?? req.query.access_token;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('app.jwtSecret');
    const issuer = configService.get<string>('app.jwtIssuer');
    if (!secret) {
      throw new Error('JWT secret is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractTokenFromQuery,
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
      issuer,
    });
  }

  validate(payload: Record<string, unknown>): JwtUser {
    const scopeRaw = payload.scope;
    let scope: string[] | undefined;

    if (Array.isArray(scopeRaw)) {
      scope = scopeRaw.map(String);
    } else if (typeof scopeRaw === 'string') {
      scope = scopeRaw
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean);
    }

    return {
      ...(payload as JwtUser),
      scope,
    };
  }
}
