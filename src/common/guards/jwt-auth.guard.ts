import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_API_KEY_KEY } from '../decorators/allow-api-key.decorator';
import { AuthUser } from '../decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allowApiKey = this.reflector.getAllAndOverride<boolean>(ALLOW_API_KEY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (allowApiKey) {
      const request = context.switchToHttp().getRequest<{
        headers: Record<string, string | undefined>;
        user?: AuthUser;
      }>();
      const apiKey =
        request.headers['x-api-key'] ||
        request.headers['x-api-key'.toLowerCase()];
      const expected = this.config.get<string>('SERVICE_API_KEY');
      if (apiKey && expected && apiKey === expected) {
        request.user = {
          id: 'service',
          email: 'service@n8n',
          role: UserRole.ADMIN,
          driverId: null,
          isService: true,
        };
        return true;
      }
    }

    return super.canActivate(context);
  }

  handleRequest<TUser>(err: Error | null, user: TUser): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
