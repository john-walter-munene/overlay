import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

export const FEEDBACK_CATEGORIES = [
  'suggestion',
  'bug',
  'question',
  'fees',
  'complaint',
  'other',
] as const;
const STATUSES = ['new', 'reviewed', 'archived'] as const;
type FeedbackStatus = (typeof STATUSES)[number];

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  /** Capture a support-center submission (may be anonymous). */
  async create(
    category: string,
    message: string,
    email?: string,
    userId?: string,
  ) {
    if (!FEEDBACK_CATEGORIES.includes(category as (typeof FEEDBACK_CATEGORIES)[number])) {
      throw new BadRequestException('Invalid category.');
    }
    const msg = (message ?? '').trim();
    if (msg.length < 3) {
      throw new BadRequestException('Please add a bit more detail.');
    }
    const fb = await this.prisma.feedback.create({
      data: {
        category,
        message: msg.slice(0, 4000),
        email: email?.trim() || null,
        userId: userId ?? null,
      },
    });
    return { id: fb.id, status: fb.status };
  }

  /** Admin: list feedback, optionally filtered by status. */
  async listForAdmin(status?: string) {
    const where = STATUSES.includes(status as FeedbackStatus)
      ? { status: status as FeedbackStatus }
      : {};
    const rows = await this.prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((f) => ({
      id: f.id,
      category: f.category,
      message: f.message,
      email: f.email,
      userId: f.userId,
      status: f.status,
      createdAt: f.createdAt,
    }));
  }

  /** Admin: move a feedback item through its lifecycle. */
  async updateStatus(id: string, status: string) {
    if (!STATUSES.includes(status as FeedbackStatus)) {
      throw new BadRequestException('Invalid status.');
    }
    const exists = await this.prisma.feedback.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Feedback not found');
    const fb = await this.prisma.feedback.update({
      where: { id },
      data: { status: status as FeedbackStatus },
    });
    return { id: fb.id, status: fb.status };
  }

  countNew() {
    return this.prisma.feedback.count({ where: { status: 'new' } });
  }
}
