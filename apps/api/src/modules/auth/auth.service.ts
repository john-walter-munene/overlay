import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { validatePassword, isPwnedPassword } from '@overlay/shared';
import { PrismaService } from '../../prisma.service';
import { hashPassword, verifyPassword, type AuthUser } from '../../common/crypto';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Enforce the shared password policy (OB-005) and, when enabled, reject
   * known-breached passwords via the HIBP k-anonymity API. Fails open on
   * network errors so an outage never blocks a legitimate signup/reset.
   */
  async assertPasswordStrength(password: string): Promise<void> {
    const { valid, errors } = validatePassword(password);
    if (!valid) throw new BadRequestException(errors);

    if (process.env.PASSWORD_BREACH_CHECK === 'true') {
      if (await isPwnedPassword(password)) {
        throw new BadRequestException(
          'This password has appeared in a data breach; choose a different one',
        );
      }
    }
  }

  /** Register a user (and a Tipster profile when role === 'tipster'). */
  async register(dto: RegisterDto): Promise<{ token: string }> {
    await this.assertPasswordStrength(dto.password);

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const role = dto.role ?? 'user';
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash: hashPassword(dto.password),
          role,
        },
      });
      if (role === 'tipster') {
        await tx.tipster.create({ data: { userId: created.id } });
      }
      return created;
    });

    return { token: this.sign(user.id, role, role === 'tipster' ? user.id : undefined) };
  }

  /** Validate credentials and issue a JWT. */
  async login(dto: LoginDto): Promise<{ token: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (
      !user ||
      !user.passwordHash ||
      !verifyPassword(dto.password, user.passwordHash)
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const tipsterId = user.role === 'tipster' ? user.id : undefined;
    return { token: this.sign(user.id, user.role, tipsterId) };
  }

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

  private sign(
    userId: string,
    role: AuthUser['role'],
    tipsterId?: string,
  ): string {
    return this.jwt.sign({ sub: userId, role, tipsterId });
  }
}
