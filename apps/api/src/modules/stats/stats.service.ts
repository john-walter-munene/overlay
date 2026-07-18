import { Injectable } from '@nestjs/common';
import { computeSegmentedStats, type SettledPick } from '@overlay/shared';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recompute a tipster's materialized stats from their settled picks using the
   * shared, unit-tested stats engine. Called by the stats worker after each
   * settlement batch (see docs/ARCHITECTURE.md §3.3).
   *
   * The headline figures cover PRE-MATCH picks only (the CLV-bearing book), so
   * the leaderboard yield is never diluted by in-play results. Live/in-play
   * picks are aggregated into the separate `live*` fields (OB-039).
   */
  async recomputeForTipster(tipsterId: string) {
    const picks = await this.prisma.pick.findMany({
      where: { tipsterId, status: { not: 'pending' } },
    });

    const input: SettledPick[] = picks.map((p) => ({
      oddsAtPick: p.oddsAtPick,
      stakeUnits: p.stakeUnits,
      status: p.status,
      pickType: p.pickType,
      closingOdds: p.closingOdds,
      settledAt: p.settledAt ? p.settledAt.getTime() : null,
    }));

    const { preMatch, live } = computeSegmentedStats(input);
    const data = {
      ...preMatch,
      liveYield: live.yield,
      liveWinRate: live.winRate,
      liveSampleSize: live.sampleSize,
    };

    return this.prisma.tipsterStats.upsert({
      where: { tipsterId },
      create: { tipsterId, ...data },
      update: data,
    });
  }

  /**
   * Leaderboard: verified tipsters only, filtered by a minimum sample size so
   * lucky newcomers don't top the board. Ranked by yield then CLV. Includes the
   * tipster's country so the UI can show a flag next to their name.
   */
  async leaderboard(minSampleSize = 10, limit = 100) {
    const rows = await this.prisma.tipsterStats.findMany({
      where: {
        sampleSize: { gte: minSampleSize },
        // Hide suspended tipsters from the public marketplace/leaderboard.
        tipster: { status: 'active' },
      },
      orderBy: [{ yield: 'desc' }, { clvAvg: 'desc' }],
      take: limit,
      include: {
        tipster: {
          select: {
            country: true,
            displayName: true,
            user: { select: { username: true, avatarUrl: true } },
          },
        },
      },
    });
    return rows.map(({ tipster, ...s }) => ({
      ...s,
      country: tipster?.country ?? null,
      // Public display label — never the raw id (that's for internal logic).
      name: tipster?.displayName ?? tipster?.user?.username ?? null,
      avatarUrl: tipster?.user?.avatarUrl ?? null,
    }));
  }
}
