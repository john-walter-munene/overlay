import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

const NEGATIVE_REASONS = ['fake_record', 'scam', 'impersonation', 'spam', 'other'] as const;
const POSITIVE_REASONS = ['accurate', 'communication', 'value', 'recommend', 'other'] as const;
const STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'] as const;
type ReportStatus = (typeof STATUSES)[number];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A subscriber leaves feedback about a tipster — praise (`positive`) or a
   * complaint (`negative`). Requires an existing subscription to that tipster
   * and blocks piling up duplicate open complaints.
   */
  async create(
    reporterId: string,
    tipsterId: string,
    sentiment: string,
    reason: string,
    details?: string,
  ) {
    if (reporterId === tipsterId) {
      throw new BadRequestException('You cannot leave feedback on your own account.');
    }
    if (sentiment !== 'positive' && sentiment !== 'negative') {
      throw new BadRequestException('Invalid feedback type.');
    }
    const allowed =
      sentiment === 'positive' ? POSITIVE_REASONS : NEGATIVE_REASONS;
    if (!(allowed as readonly string[]).includes(reason)) {
      throw new BadRequestException('Invalid feedback reason.');
    }
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
      select: { userId: true },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');

    const sub = await this.prisma.subscription.findUnique({
      where: { userId_tipsterId: { userId: reporterId, tipsterId } },
    });
    if (!sub) {
      throw new ForbiddenException(
        'You can only leave feedback on a tipster you have subscribed to.',
      );
    }

    // Only guard against duplicate open *complaints*; praise can repeat.
    if (sentiment === 'negative') {
      const openAlready = await this.prisma.tipsterReport.findFirst({
        where: {
          reporterId,
          tipsterId,
          sentiment: 'negative',
          status: { in: ['open', 'reviewing'] },
        },
      });
      if (openAlready) {
        throw new BadRequestException(
          'You already have an open complaint for this tipster.',
        );
      }
    }

    const report = await this.prisma.tipsterReport.create({
      data: {
        reporterId,
        tipsterId,
        sentiment,
        reason,
        details: details?.trim() || null,
      },
    });
    return {
      id: report.id,
      status: report.status,
      createdAt: report.createdAt,
    };
  }

  /** Admin: list feedback, optionally filtered by status. */
  async listForAdmin(status?: string) {
    const where = STATUSES.includes(status as ReportStatus)
      ? { status: status as ReportStatus }
      : {};
    const reports = await this.prisma.tipsterReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        reporter: { select: { id: true, username: true, email: true } },
        tipster: { select: { userId: true, displayName: true } },
      },
    });
    return reports.map((r) => ({
      id: r.id,
      sentiment: r.sentiment,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
      reviewNote: r.reviewNote,
      reporter: {
        id: r.reporter.id,
        username: r.reporter.username,
        email: r.reporter.email,
      },
      tipsterId: r.tipster.userId,
      tipsterName: r.tipster.displayName,
    }));
  }

  /** Admin: move a report through its review lifecycle. */
  async updateStatus(id: string, status: string, reviewNote?: string) {
    if (!STATUSES.includes(status as ReportStatus)) {
      throw new BadRequestException('Invalid status.');
    }
    const exists = await this.prisma.tipsterReport.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Report not found');
    const report = await this.prisma.tipsterReport.update({
      where: { id },
      data: {
        status: status as ReportStatus,
        reviewNote: reviewNote?.trim() || null,
        reviewedAt: new Date(),
      },
    });
    return { id: report.id, status: report.status };
  }

  /** Count of reports still needing attention (for the admin dashboard). */
  countOpen() {
    return this.prisma.tipsterReport.count({
      where: { status: { in: ['open', 'reviewing'] } },
    });
  }
}
