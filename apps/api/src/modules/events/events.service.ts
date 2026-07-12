import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { SPORTS_PROVIDER } from '../../integrations/sports/sports.module';
import type { SportsDataProvider } from '../../integrations/sports/sports-provider.interface';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SPORTS_PROVIDER) private readonly provider: SportsDataProvider,
  ) {}

  /**
   * Pull upcoming fixtures from the active provider and upsert them by
   * vendorEventId. Called by the ingest-events worker or an admin endpoint.
   */
  async ingest(sport: string): Promise<number> {
    const events = await this.provider.getUpcomingEvents(sport);
    for (const e of events) {
      await this.prisma.event.upsert({
        where: { vendorEventId: e.vendorEventId },
        create: {
          vendorEventId: e.vendorEventId,
          sport: e.sport,
          league: e.league,
          home: e.home,
          away: e.away,
          startTime: e.startTime,
        },
        update: { startTime: e.startTime, status: 'scheduled' },
      });
    }
    return events.length;
  }

  /** Upcoming events available for tipsters to pick. */
  listUpcoming(limit = 100) {
    return this.prisma.event.findMany({
      where: { startTime: { gt: new Date() }, status: 'scheduled' },
      orderBy: { startTime: 'asc' },
      take: limit,
    });
  }
}
