import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Throttler keyed on the authenticated principal rather than the source IP.
 *
 * The global JwtAuthGuard runs before this guard and populates `req.user` with
 * either a JWT user (`{ sub, username, ... }`) or an API-token principal
 * (`{ type: 'token', tokenId, name }`). We pick a stable identifier per
 * principal so a chatty service token can't starve the rate-limit budget for
 * the human dashboard, and vice versa.
 *
 * Unauthenticated requests (e.g. `/api/auth/login`) fall back to client IP.
 */
@Injectable()
export class PrincipalThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const user = req?.user;
    if (user?.type === 'token' && typeof user.tokenId === 'string') {
      return `token:${user.tokenId}`;
    }
    if (typeof user?.sub === 'string') {
      return `user:${user.sub}`;
    }
    return `ip:${req?.ip ?? 'unknown'}`;
  }
}
