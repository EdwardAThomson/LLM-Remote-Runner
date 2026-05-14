import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Strategy } from 'passport-custom';
import { ApiTokensService, VerifiedTokenPrincipal } from './api-tokens.service';

const TOKEN_PREFIX = 'rrt_';

function extractCandidateToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  const queryValue = req.query?.token ?? req.query?.access_token;
  if (Array.isArray(queryValue)) {
    const first = queryValue[0];
    return typeof first === 'string' ? first : null;
  }
  if (typeof queryValue === 'string') {
    return queryValue;
  }
  return null;
}

@Injectable()
export class ApiTokenStrategy extends PassportStrategy(Strategy, 'api-token') {
  constructor(private readonly apiTokens: ApiTokensService) {
    super();
  }

  async validate(req: Request): Promise<VerifiedTokenPrincipal> {
    const candidate = extractCandidateToken(req);
    if (!candidate || !candidate.startsWith(TOKEN_PREFIX)) {
      // Not an API token — fall through to the next strategy.
      throw new UnauthorizedException();
    }
    const principal = await this.apiTokens.verify(candidate);
    if (!principal) {
      throw new UnauthorizedException();
    }
    return principal;
  }
}
