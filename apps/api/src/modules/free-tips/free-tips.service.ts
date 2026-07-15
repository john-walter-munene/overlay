import { Injectable, NotFoundException } from '@nestjs/common';
import {
  isoDateToUtc,
  parseIsoDate,
  toIsoDate,
  todayIsoDate,
} from '@overlay/shared';
import { PrismaService } from '../../prisma.service';
import type { CreateFreeTipDto } from './dto/create-free-tip.dto';
import type { UpdateFreeTipDto } from './dto/update-free-tip.dto';
import { buildFreeTipsForDate, toPublicFreeTip } from './free-tips';

@Injectable()
export class FreeTipsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public per-date listing (OB-150): the ungated free "bets of the day" for a
   * single calendar day, ordered by admin sort then creation time. An unknown
   * or malformed `date` falls back to today so the hub always renders. Days
   * with no tips return an empty list (the UI shows an empty state).
   */
  async listByDate(date?: string) {
    const iso = parseIsoDate(date) ?? todayIsoDate();
    const rows = await this.prisma.freeTip.findMany({
      where: { tipDate: isoDateToUtc(iso) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return buildFreeTipsForDate(iso, rows);
  }

  /** Distinct calendar days that currently have at least one free tip. */
  async listDates(): Promise<string[]> {
    const rows = await this.prisma.freeTip.findMany({
      distinct: ['tipDate'],
      select: { tipDate: true },
      orderBy: { tipDate: 'desc' },
    });
    return rows.map((r) => toIsoDate(r.tipDate));
  }

  // ---- admin management ----

  /** Admin list across every day, newest day first. */
  async listAll() {
    const rows = await this.prisma.freeTip.findMany({
      orderBy: [{ tipDate: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toPublicFreeTip);
  }

  async create(dto: CreateFreeTipDto) {
    const iso = parseIsoDate(dto.date) ?? todayIsoDate();
    const row = await this.prisma.freeTip.create({
      data: {
        tipDate: isoDateToUtc(iso),
        sport: dto.sport.trim(),
        league: dto.league?.trim() || null,
        match: dto.match.trim(),
        market: dto.market.trim(),
        selection: dto.selection.trim(),
        odds: dto.odds ?? null,
        analysis: dto.analysis?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    return toPublicFreeTip(row);
  }

  async update(id: string, dto: UpdateFreeTipDto) {
    const existing = await this.prisma.freeTip.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Free tip not found');
    const row = await this.prisma.freeTip.update({
      where: { id },
      data: {
        tipDate: dto.date
          ? isoDateToUtc(parseIsoDate(dto.date) ?? todayIsoDate())
          : existing.tipDate,
        sport: dto.sport?.trim() ?? existing.sport,
        league:
          dto.league === undefined ? existing.league : dto.league.trim() || null,
        match: dto.match?.trim() ?? existing.match,
        market: dto.market?.trim() ?? existing.market,
        selection: dto.selection?.trim() ?? existing.selection,
        odds: dto.odds === undefined ? existing.odds : dto.odds,
        analysis:
          dto.analysis === undefined
            ? existing.analysis
            : dto.analysis.trim() || null,
        sortOrder: dto.sortOrder ?? existing.sortOrder,
      },
    });
    return toPublicFreeTip(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.freeTip.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Free tip not found');
    await this.prisma.freeTip.delete({ where: { id } });
    return { deleted: true };
  }
}
