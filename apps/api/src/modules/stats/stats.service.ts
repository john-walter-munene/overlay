import { Injectable } from '@nestjs/common';
import { computeTipsterStats, type SettledPick } from '@overlay/shared';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recompute a tipster's materialized stats from their settled picks using the
   * shared, unit-tested stats engine. Called by the stats worker after each
   * settlement batch (see docs/ARCHITECTURE.md §3.3).
   */
  async recomputeForTipster(tipsterId: string) {
    const picks = await this.prisma.pick.findMany({
      where: { tipsterId, status: { not: 'pending' } },
    });

    const input: SettledPick[] = picks.map((p) => ({
      oddsAtPick: p.oddsAtPick,
      stakeUnits: p.stakeUnits,
      status: p.status,
      closingOdds: p.closingOdds,
      settledAt: p.settledAt ? p.settledAt.getTime() : null,
    }));

    const s = computeTipsterStats(input);

    return this.prisma.tipsterStats.upsert({
      where: { tipsterId },
      create: { tipsterId, ...s },
      update: s,
    });
  }

  /**
   * Leaderboard: verified tipsters only, filtered by a minimum sample size so
   * lucky newcomers don't top the board. Ranked by yield then CLV.
   */
  leaderboard(minSampleSize = 50, limit = 100) {
    return this.prisma.tipsterStats.findMany({
      where: { sampleSize: { gte: minSampleSize } },
      orderBy: [{ yield: 'desc' }, { clvAvg: 'desc' }],
      take: limit,
    });
  }
}
