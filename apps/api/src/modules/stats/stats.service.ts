import { Inject, Injectable } from '@nestjs/common';
import {
  computeSegmentedStats,
  evaluateGraduation,
  nextGraduationStatus,
  normalizeGraduationStatus,
  type SettledPick,
} from '@overlay/shared';
import { PrismaService } from '../../prisma.service';
import { resolveGraduationThreshold } from './graduation-config';
import type { LeaderboardCache } from './leaderboard-cache';
import { LEADERBOARD_CACHE } from './leaderboard-cache.redis';
import type { EntityCache } from '../../common/cache/entity-cache';
import { TIPSTER_PROFILE_CACHE } from '../../common/cache/cache.module';
import { readLeaderboardCached } from './leaderboard-query';

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LEADERBOARD_CACHE) private readonly cache: LeaderboardCache,
    @Inject(TIPSTER_PROFILE_CACHE)
    private readonly profileCache: EntityCache,
  ) {}

  /**
   * Recompute a tipster's materialized stats from their settled picks using the
   * shared, unit-tested stats engine. Called by the stats worker after each
   * settlement batch (see docs/ARCHITECTURE.md §3.3).
   *
   * Also advances the tipster's Rising → Verified graduation state (OB-153): a
   * provisional (`rising`) tipster that crosses the configurable graduation
   * threshold is flagged `pending_review` so an admin can assign the verified
   * tag. This never gates picks or enables billing on its own.
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

    const stats = await this.prisma.tipsterStats.upsert({
      where: { tipsterId },
      create: { tipsterId, ...data },
      update: data,
    });

    await this.evaluateGraduationFor(tipsterId, stats.winRate, stats.sampleSize);

    // OB-055: the recompute changed the materialized figures that rank the
    // board, so retire the cached leaderboard. The next read recomputes fresh
    // rows — this is how settlement "updates within minutes".
    await this.cache.invalidate();

    // OB-130: the same figures appear on the tipster's public profile, so retire
    // its cached copy too (scoped to this tipster).
    await this.profileCache.invalidate(tipsterId);

    return stats;
  }

  /**
   * Advance a tipster along the graduation path from their freshly-computed
   * stats. Promotion is monotonic (see the shared engine): a `rising` tipster
   * that meets the threshold becomes `pending_review` (surfacing them on the
   * admin review dashboard); already-reviewed states are never auto-demoted.
   * Eligibility is derived only from verified settled picks.
   */
  private async evaluateGraduationFor(
    tipsterId: string,
    winRate: number,
    settledBets: number,
  ) {
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
      select: { graduationStatus: true, graduationEligibleAt: true },
    });
    if (!tipster) return;

    const current = normalizeGraduationStatus(tipster.graduationStatus);
    const evaluation = evaluateGraduation(
      { winRate, settledBets },
      resolveGraduationThreshold(),
    );
    const next = nextGraduationStatus(current, evaluation);

    // Nothing to do unless the tipster is being promoted for the first time.
    if (next === current && tipster.graduationEligibleAt) return;
    if (next === current && !evaluation.eligible) return;

    await this.prisma.tipster.update({
      where: { userId: tipsterId },
      data: {
        graduationStatus: next,
        // Stamp the first time they qualified so the admin queue can order by it.
        graduationEligibleAt:
          evaluation.eligible && !tipster.graduationEligibleAt
            ? new Date()
            : tipster.graduationEligibleAt,
      },
    });
  }

  /**
   * Leaderboard: verified tipsters only, filtered by a minimum sample size so
   * lucky newcomers don't top the board. Ranked by yield then CLV. Includes the
   * tipster's country so the UI can show a flag next to their name.
   */
  async leaderboard(minSampleSize = 10, limit = 100) {
    // OB-055: serve from the Redis cache when warm (read-through). The cache is
    // best-effort — a miss (or an unreachable Redis) falls through to the DB
    // aggregate below and repopulates it.
    return readLeaderboardCached<LeaderboardRow>(
      this.cache,
      minSampleSize,
      limit,
      () => this.computeLeaderboard(minSampleSize, limit),
    );
  }

  /** The uncached DB aggregate behind the leaderboard. */
  private async computeLeaderboard(
    minSampleSize: number,
    limit: number,
  ): Promise<LeaderboardRow[]> {
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

/** A single, UI-ready leaderboard row (materialized stats + public identity). */
type LeaderboardRow = Record<string, unknown> & {
  country: string | null;
  name: string | null;
  avatarUrl: string | null;
};
