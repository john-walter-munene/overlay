import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';

/**
 * Auth is handled by Supabase (OB-145). The API only exposes the resolved
 * local profile for the authenticated Supabase user; sign-up / sign-in happen
 * client-side against Supabase.
 */
@Controller('auth')
export class AuthController {
  /** Resolved local profile (userId, role, tipsterId) for the current user. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
