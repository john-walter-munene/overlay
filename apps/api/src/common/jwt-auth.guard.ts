import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthUser } from './crypto';
import { verifySupabaseToken } from './supabase';
import { AuthService } from '../modules/auth/auth.service';

/**
 * Verifies the Supabase access token (OB-145) and attaches the resolved local
 * `AuthUser` to the request. Keeps the same `req.user` shape so RolesGuard,
 * CurrentUser, and controllers are unchanged.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      const claims = await verifySupabaseToken(header.slice(7));
      const user: AuthUser = await this.auth.provisionSupabaseUser({
        supabaseUserId: claims.sub,
        email: claims.email,
        role: claims.user_metadata?.role ?? claims.app_metadata?.role,
      });
      req.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
