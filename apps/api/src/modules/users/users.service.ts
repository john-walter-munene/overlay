import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Full self-profile for the account page. */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        tipster: { select: { userId: true } },
        _count: { select: { subscriptions: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      userId: user.id,
      email: user.email,
      username: user.username,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt,
      tipsterId: user.tipster?.userId ?? null,
      subscriptionCount: user._count.subscriptions,
    };
  }

  private normalize(username: string): string {
    return (username ?? '').trim().toLowerCase();
  }

  /** Persist the user's uploaded avatar URL. */
  async setAvatar(userId: string, url: string): Promise<{ avatarUrl: string | null }> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
      select: { avatarUrl: true },
    });
    return { avatarUrl: user.avatarUrl };
  }

  /** Remove the user's avatar (revert to the generated fallback). */
  async clearAvatar(userId: string): Promise<{ avatarUrl: string | null }> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: { avatarUrl: true },
    });
    return { avatarUrl: user.avatarUrl };
  }

  /** Is a handle free (and valid)? excludeUserId lets a user keep their own. */
  async checkUsername(raw: string, excludeUserId?: string) {
    const username = this.normalize(raw);
    if (!USERNAME_RE.test(username)) {
      return { available: false, valid: false };
    }
    const existing = await this.prisma.user.findUnique({ where: { username } });
    return { available: !existing || existing.id === excludeUserId, valid: true };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.username !== undefined) {
      const username = this.normalize(dto.username);
      if (!USERNAME_RE.test(username)) {
        throw new BadRequestException('Invalid username');
      }
      const existing = await this.prisma.user.findUnique({
        where: { username },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('That username is taken');
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: { username },
      });
    }
    return this.getProfile(userId);
  }
}
