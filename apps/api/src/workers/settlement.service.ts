import { Inject, Injectable, Logger } from '@nestjs/common';
import { pickClv, type SettledPick } from '@overlay/shared';
import { PrismaService } from '../prisma.service';
import { StatsService } from '../modules/stats/stats.service';
import {
  SPORTS_PROVIDER,
} from '../integrations/sports/sports.module';
import type { SportsDataProvider } from '../integrations/sports/sports-provider.interface';
import { recordSettlementCycle } from '../common/metrics';

/**
 * Core settlement pipeline (docs/ARCHITECTURE.md §3.3 / §5.2). All steps are
 * idempotent so they can be retried safely by BullMQ. Only this service writes
 * settlement fields on picks — enforcing the append-only integrity model.
 */
@Injectable()
export class SettlementService {
  private readonly log = new Logger(SettlementService.name);
  /** Picks graded by the most recent settlePicks() call (for metrics). */
  private lastSettledCount = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: StatsService,
    @Inject(SPORTS_PROVIDER) private readonly provider: SportsDataProvider,
  ) {}

  /** Orchestrate one full cycle. Safe to run on a cron. */
  async runOnce(): Promise<void> {
    // OB-093: time every cycle and record its outcome so the settlement
    // latency + error-rate SLOs can be alerted on (see docs/OBSERVABILITY.md).
    const startedAt = Date.now();
    let settledPicks = 0;
    try {
      await this.captureClosingOdds();
      const affected = await this.settlePicks();
      settledPicks = this.lastSettledCount;
      await this.computeClv();
      await this.recomputeStats(affected);
      recordSettlementCycle({
        durationSeconds: (Date.now() - startedAt) / 1000,
        settledPicks,
        ok: true,
      });
    } catch (err) {
      recordSettlementCycle({
        durationSeconds: (Date.now() - startedAt) / 1000,
        settledPicks,
        ok: false,
      });
      throw err;
    }
  }

  /**
   * Snapshot closing odds for events at/after kickoff that haven't been
   * captured yet, and stamp each still-pending pick with its closing line.
   */
  async captureClosingOdds(): Promise<void> {
    const events = await this.prisma.event.findMany({
      where: { startTime: { lte: new Date() }, closingCapturedAt: null },
    });
    for (const event of events) {
      const markets = await this.provider.getOdds(event.vendorEventId);
      if (markets.length === 0) continue;

      const pending = await this.prisma.pick.findMany({
        where: { eventId: event.id, status: 'pending', closingOdds: null },
      });
      for (const pick of pending) {
        const market = markets.find((m) => m.market === pick.market);
        const price = market?.prices[pick.selection];
        if (price) {
          await this.prisma.pick.update({
            where: { id: pick.id },
            data: { closingOdds: price },
          });
        }
      }
      await this.prisma.event.update({
        where: { id: event.id },
        data: { closingCapturedAt: new Date() },
      });
    }
  }

  /**
   * Grade pending picks on finished events. Returns the set of affected
   * tipsterIds so their stats can be recomputed.
   */
  async settlePicks(): Promise<Set<string>> {
    const affected = new Set<string>();
    let settledCount = 0;
    const events = await this.prisma.event.findMany({
      where: {
        startTime: { lte: new Date() },
        picks: { some: { status: 'pending' } },
      },
    });

    for (const event of events) {
      const result = await this.provider.getResult(event.vendorEventId);
      if (!result) continue;

      const pending = await this.prisma.pick.findMany({
        where: { eventId: event.id, status: 'pending' },
      });
      for (const pick of pending) {
        const outcome = result.grade(pick.market, pick.selection);
        // Idempotent: only transition picks that are still pending.
        const { count } = await this.prisma.pick.updateMany({
          where: { id: pick.id, status: 'pending' },
          data: {
            status: outcome,
            result: JSON.stringify(result.raw),
            settledAt: new Date(),
          },
        });
        settledCount += count;
        affected.add(pick.tipsterId);
      }
      await this.prisma.event.update({
        where: { id: event.id },
        data: { status: 'finished' },
      });
    }

    // Number of picks actually graded this cycle, exposed to runOnce so the
    // settlement throughput metric (OB-093) counts picks, not tipsters.
    this.lastSettledCount = settledCount;

    if (affected.size > 0) {
      this.log.log(`Settled picks for ${affected.size} tipster(s)`);
    }
    return affected;
  }

  /** Compute CLV for settled picks that have a closing line but no CLV yet. */
  async computeClv(): Promise<void> {
    const picks = await this.prisma.pick.findMany({
      where: {
        status: { not: 'pending' },
        closingOdds: { not: null },
        clv: null,
      },
    });
    for (const pick of picks) {
      const input: SettledPick = {
        oddsAtPick: pick.oddsAtPick,
        stakeUnits: pick.stakeUnits,
        status: pick.status,
        closingOdds: pick.closingOdds,
      };
      const clv = pickClv(input);
      if (clv !== null) {
        await this.prisma.pick.update({
          where: { id: pick.id },
          data: { clv },
        });
      }
    }
  }

  /** Recompute materialized stats for the given tipsters. */
  async recomputeStats(tipsterIds: Set<string>): Promise<void> {
    for (const tipsterId of tipsterIds) {
      await this.stats.recomputeForTipster(tipsterId);
    }
  }
}
