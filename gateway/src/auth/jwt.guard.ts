import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Global guard applied to every route. Accepts EITHER a JWT (human login flow)
 * or an API token (service callers). Routes that must remain JWT-only (e.g.
 * token management) layer the strict `JwtAuthGuard` from
 * `jwt-auth.guard.ts` on top of this one.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard(['jwt', 'api-token']) {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
  ): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication token required');
    }
    return user;
  }
}
