import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUser } from './jwt-user.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as JwtUser | undefined;
  },
);
