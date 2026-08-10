import { Inject, Injectable } from '@nestjs/common';
import { toPublicAnnouncement } from '@overlay/shared';
import { PrismaService } from '../../prisma.service';
import { NOTIFIER, type Notifier } from '../notifications/notifier.interface';
import {
  dispatchAnnouncementWithPreferences,
  loadSubscriberRecipients,
} from '../notifications/preferences';
import { announcementEmail } from '../notifications/templates';
import type { CreateAnnouncementDto } from './dto/create-announcement.dto';
import type { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import {
  cancelAnnouncement,
  createAnnouncement,
  fanOutAnnouncement,
  listMineAnnouncements,
  listUpcomingAnnouncements,
  updateAnnouncement,
  type AnnouncementFanOutDeps,
} from './announcements.core';

/**
 * Tip-drop schedule announcements (OB-034). Thin Nest wrapper that injects the
 * DB + active notifier and delegates to the decorator-free core (so the fan-out
 * and schedule logic can be integration-tested without Nest). Publishing reuses
 * the preference-aware, unsubscribe-honouring subscriber fan-out.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  /** Public origin of the API, used to build one-click unsubscribe links. */
  private baseUrl(): string {
    return (
      process.env.PUBLIC_API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:4000'
    );
  }

  /** The notification collaborators the core fan-out delegates to. */
  private fanOutDeps(): AnnouncementFanOutDeps {
    return {
      notifier: this.notifier,
      baseUrl: this.baseUrl(),
      loadRecipients: loadSubscriberRecipients,
      buildEmail: announcementEmail,
      dispatch: dispatchAnnouncementWithPreferences,
    };
  }

  /**
   * Create and publish a schedule announcement: persists it with an audit entry,
   * then fans out to active subscribers (enqueued in production; awaited here in
   * v1). The announcement carries only timing, never gated pick content.
   */
  async create(tipsterId: string, dto: CreateAnnouncementDto) {
    const row = await createAnnouncement(this.prisma, tipsterId, dto);
    // Publish fan-out (enqueue in production). Idempotent via `announcedAt`.
    await fanOutAnnouncement(this.prisma, row.id, 'published', this.fanOutDeps());
    return toPublicAnnouncement(row);
  }

  /** Edit an announcement (recomputes the next drop time) with an audit entry. */
  async update(tipsterId: string, id: string, dto: UpdateAnnouncementDto) {
    const row = await updateAnnouncement(this.prisma, tipsterId, id, dto);
    return toPublicAnnouncement(row);
  }

  /** Cancel an announcement (soft — keeps history) with an audit entry. */
  async cancel(tipsterId: string, id: string) {
    const row = await cancelAnnouncement(this.prisma, tipsterId, id);
    return toPublicAnnouncement(row);
  }

  /** A tipster's own announcements. */
  listMine(tipsterId: string) {
    return listMineAnnouncements(this.prisma, tipsterId);
  }

  /** Upcoming scheduled drops for tipsters the user follows/subscribes to. */
  listUpcomingForUser(userId: string) {
    return listUpcomingAnnouncements(this.prisma, userId);
  }

  /**
   * Fan out an announcement (publish or pre-drop reminder). Idempotent; intended
   * to be triggered from the queue worker. Returns the number notified.
   */
  announce(id: string, kind: 'published' | 'reminder') {
    return fanOutAnnouncement(this.prisma, id, kind, this.fanOutDeps());
  }
}
