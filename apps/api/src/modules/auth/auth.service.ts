import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type { Role } from '@overlay/shared';
import type { AuthUser } from '../../common/crypto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve (or create) the local User for an authenticated Supabase identity
   * (OB-145). Links by supabaseUserId, adopting an existing row with the same
   * email (e.g. the seeded admin) on first login.
   *
   * Roles: `appRole` comes from Supabase **app_metadata** (only settable by an
   * admin / the dashboard) and is TRUSTED — it can grant any role incl. admin,
   * and is authoritative (promotes/syncs existing users). `requestedRole` comes
   * from **user_metadata** (self-selected at signup, user-editable) so it is
   * capped to non-privileged roles (user/tipster) — never admin.
   */
  async provisionSupabaseUser(params: {
    supabaseUserId: string;
    email?: string;
    appRole?: string;
    requestedRole?: string;
  }): Promise<AuthUser> {
    const { supabaseUserId, email } = params;
    const trusted = AuthService.trustedRole(params.appRole);

    let user = await this.prisma.user.findUnique({ where: { supabaseUserId } });

    if (!user && email) {
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { supabaseUserId },
        });
      }
    }

    // Only ensure the Tipster row when the user is first created as, or promoted
    // to, a tipster — not on every request.
    let ensureTipster = false;
    if (!user) {
      const role = trusted ?? AuthService.selfRole(params.requestedRole);
      user = await this.provisionNewUser(supabaseUserId, email, role);
      ensureTipster = role === 'tipster';
    } else if (trusted && user.role !== trusted) {
      // app_metadata is authoritative — promote/sync the existing user.
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { role: trusted },
      });
      ensureTipster = trusted === 'tipster';
    }

    if (ensureTipster) {
      await this.prisma.tipster.upsert({
        where: { userId: user.id },
        create: { userId: user.id, sports: [] },
        update: {},
      });
    }

    return {
      userId: user.id,
      role: user.role as AuthUser['role'],
      tipsterId: user.role === 'tipster' ? user.id : undefined,
    };
  }

  private provisionNewUser(
    supabaseUserId: string,
    email: string | undefined,
    role: Role,
  ) {
    return this.prisma.user.create({
      data: {
        supabaseUserId,
        email: email ?? `${supabaseUserId}@users.noreply.overlay`,
        role,
      },
    });
  }

  /** Trusted role from app_metadata (admin-set); may be admin or staff. */
  private static trustedRole(role?: string): Role | null {
    return role === 'admin' ||
      role === 'staff' ||
      role === 'tipster' ||
      role === 'user'
      ? role
      : null;
  }

  /** Self-selected role at signup — never privileged (never staff/admin). */
  private static selfRole(role?: string): 'user' | 'tipster' {
    return role === 'tipster' ? 'tipster' : 'user';
  }
}
