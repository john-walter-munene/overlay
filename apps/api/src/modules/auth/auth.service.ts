import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type { AuthUser } from '../../common/crypto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve (or create) the local User for an authenticated Supabase identity
   * (OB-145). Called by the auth guard on each request. Links by
   * supabaseUserId, adopting an existing row with the same email (e.g. the
   * seeded admin) on first login, otherwise provisioning a new user.
   */
  async provisionSupabaseUser(params: {
    supabaseUserId: string;
    email?: string;
    role?: string;
  }): Promise<AuthUser> {
    const { supabaseUserId, email } = params;

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

    if (!user) {
      const desiredRole = AuthService.normalizeRole(params.role);
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            supabaseUserId,
            email: email ?? `${supabaseUserId}@users.noreply.overlay`,
            role: desiredRole,
          },
        });
        if (desiredRole === 'tipster') {
          await tx.tipster.upsert({
            where: { userId: created.id },
            create: { userId: created.id, sports: [] },
            update: {},
          });
        }
        return created;
      });
    }

    return {
      userId: user.id,
      role: user.role as AuthUser['role'],
      tipsterId: user.role === 'tipster' ? user.id : undefined,
    };
  }

  private static normalizeRole(role?: string): 'user' | 'tipster' | 'admin' {
    return role === 'tipster' || role === 'admin' ? role : 'user';
  }
}
