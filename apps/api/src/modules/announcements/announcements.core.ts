// Plain (decorator-free) core for tip-drop schedule announcements (OB-034):
// persistence, validation, audit and the preference-aware subscriber fan-out.
// Kept free of Nest wiring — and free of *runtime* relative imports — so it can
// be integration-tested with a real Prisma client under Node's type-stripping
// runner (see announcements.itest.ts). Schedule/timezone maths live in
// @overlay/shared; the fan-out collaborators (recipient loading, template,
// dispatch) are injected so the notification helpers stay decoupled. The Nest
// AnnouncementsService wires the real dependencies and delegates here.

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  isoDateToUtc,
  isValidTimezone,
  parseIsoDate,
  parseTimeOfDay,
  resolveNextDropAt,
  toIsoDate,
  toPublicAnnouncement,
  type AnnouncementRecurrence,
  type PublicAnnouncement,
  type ScheduleSpec,
} from '@overlay/shared';
import type { PrismaClient } from '@prisma/client';
import type { Notifier } from '../notifications/notifier.interface';
import type { PreferenceRecipient } from '../notifications/preferences';
import type { AnnouncementNotification, EmailTemplate } from '../notifications/templates';

/** Persisted announcement columns the core reads back. */
export interface AnnouncementRow {
  id: string;
  tipsterId: string;
  title: string;
  message: string | null;
  timezone: string;
  recurrence: AnnouncementRecurrence;
  timeOfDay: string;
  dropDate: Date | null;
  weekday: number | null;
  reminderMinutes: number | null;
  nextDropAt: Date | null;
  status: 'active' | 'canceled';
  announcedAt: Date | null;
  reminderSentAt: Date | null;
}

/** Create/edit inputs (already shape-validated by the DTO layer). */
export interface AnnouncementInput {
  title: string;
  message?: string | null;
  timezone: string;
  recurrence: AnnouncementRecurrence;
  timeOfDay: string;
  date?: string | null;
  weekday?: number | null;
  reminderMinutes?: number | null;
}

/**
 * The notification collaborators the fan-out needs, injected so the core has no
 * runtime dependency on the notifications module (keeping it test-loadable).
 */
export interface AnnouncementFanOutDeps {
  notifier: Notifier;
  baseUrl: string;
  loadRecipients(
    prisma: PrismaClient,
    tipsterId: string,
  ): Promise<PreferenceRecipient[]>;
  buildEmail(announcement: AnnouncementNotification): EmailTemplate;
  dispatch(
    notifier: Notifier,
    template: EmailTemplate,
    recipients: PreferenceRecipient[],
    baseUrl: string,
  ): Promise<number>;
}

/** Validate a schedule and resolve its next drop instant (may be null). */
function resolveSchedule(spec: ScheduleSpec, now: Date): Date | null {
  if (!isValidTimezone(spec.timezone)) {
    throw new BadRequestException('Invalid IANA timezone');
  }
  if (!parseTimeOfDay(spec.timeOfDay)) {
    throw new BadRequestException('timeOfDay must be HH:MM (24h)');
  }
  if (spec.recurrence === 'one_off' && !parseIsoDate(spec.date ?? undefined)) {
    throw new BadRequestException('One-off announcements require a valid date');
  }
  if (
    spec.recurrence === 'weekly' &&
    (spec.weekday == null || spec.weekday < 0 || spec.weekday > 6)
  ) {
    throw new BadRequestException('Weekly announcements require a weekday (0-6)');
  }
  return resolveNextDropAt(spec, now);
}

function auditEntry(
  tipsterId: string,
  action: string,
  entityId: string,
  payload: Record<string, unknown> | null,
) {
  return {
    actor: `tipster:${tipsterId}`,
    action,
    entity: 'TipDropAnnouncement',
    entityId,
    payload: (payload ?? undefined) as never,
  };
}

/** Load an announcement, asserting the caller tipster owns it. */
async function owned(
  prisma: PrismaClient,
  tipsterId: string,
  id: string,
): Promise<AnnouncementRow> {
  const row = (await prisma.tipDropAnnouncement.findUnique({
    where: { id },
  })) as AnnouncementRow | null;
  if (!row) throw new NotFoundException('Announcement not found');
  if (row.tipsterId !== tipsterId) {
    throw new ForbiddenException('Not your announcement');
  }
  return row;
}

/**
 * Create an announcement: validates the schedule, persists it (resolving the
 * next drop instant) and writes an audit entry. Does NOT fan out — publishing
 * is a separate step (see fanOutAnnouncement) so the request path stays fast.
 */
export async function createAnnouncement(
  prisma: PrismaClient,
  tipsterId: string,
  input: AnnouncementInput,
  now: Date = new Date(),
): Promise<AnnouncementRow> {
  const spec: ScheduleSpec = {
    recurrence: input.recurrence,
    timezone: input.timezone.trim(),
    timeOfDay: input.timeOfDay,
    date: input.date,
    weekday: input.weekday,
  };
  const nextDropAt = resolveSchedule(spec, now);

  const row = (await prisma.tipDropAnnouncement.create({
    data: {
      tipsterId,
      title: input.title.trim(),
      message: input.message?.trim() || null,
      timezone: spec.timezone,
      recurrence: input.recurrence,
      timeOfDay: input.timeOfDay,
      dropDate:
        input.recurrence === 'one_off' && input.date
          ? isoDateToUtc(parseIsoDate(input.date)!)
          : null,
      weekday: input.recurrence === 'weekly' ? input.weekday ?? null : null,
      reminderMinutes: input.reminderMinutes ?? null,
      nextDropAt,
    },
  })) as AnnouncementRow;

  await prisma.auditLog.create({
    data: auditEntry(tipsterId, 'announcement.created', row.id, {
      title: row.title,
      recurrence: row.recurrence,
      timezone: row.timezone,
      timeOfDay: row.timeOfDay,
      nextDropAt: row.nextDropAt?.toISOString() ?? null,
    }),
  });

  return row;
}

/** Edit an announcement (recomputes the next drop time) with an audit entry. */
export async function updateAnnouncement(
  prisma: PrismaClient,
  tipsterId: string,
  id: string,
  patch: Partial<AnnouncementInput>,
  now: Date = new Date(),
): Promise<AnnouncementRow> {
  const existing = await owned(prisma, tipsterId, id);

  const recurrence = patch.recurrence ?? existing.recurrence;
  const timezone = (patch.timezone ?? existing.timezone).trim();
  const timeOfDay = patch.timeOfDay ?? existing.timeOfDay;
  const date =
    patch.date !== undefined
      ? patch.date
      : existing.dropDate
        ? toIsoDate(existing.dropDate)
        : undefined;
  const weekday = patch.weekday !== undefined ? patch.weekday : existing.weekday;

  const spec: ScheduleSpec = { recurrence, timezone, timeOfDay, date, weekday };
  const nextDropAt = resolveSchedule(spec, now);

  const row = (await prisma.tipDropAnnouncement.update({
    where: { id },
    data: {
      title: patch.title?.trim() ?? existing.title,
      message:
        patch.message === undefined
          ? existing.message
          : patch.message?.trim() || null,
      timezone,
      recurrence,
      timeOfDay,
      dropDate:
        recurrence === 'one_off' && date
          ? isoDateToUtc(parseIsoDate(date)!)
          : null,
      weekday: recurrence === 'weekly' ? weekday ?? null : null,
      reminderMinutes:
        patch.reminderMinutes === undefined
          ? existing.reminderMinutes
          : patch.reminderMinutes,
      nextDropAt,
    },
  })) as AnnouncementRow;

  await prisma.auditLog.create({
    data: auditEntry(tipsterId, 'announcement.updated', row.id, {
      nextDropAt: row.nextDropAt?.toISOString() ?? null,
    }),
  });

  return row;
}

/** Cancel an announcement (soft — keeps history) with an audit entry. */
export async function cancelAnnouncement(
  prisma: PrismaClient,
  tipsterId: string,
  id: string,
): Promise<AnnouncementRow> {
  await owned(prisma, tipsterId, id);
  const row = (await prisma.tipDropAnnouncement.update({
    where: { id },
    data: { status: 'canceled', nextDropAt: null },
  })) as AnnouncementRow;
  await prisma.auditLog.create({
    data: auditEntry(tipsterId, 'announcement.canceled', row.id, null),
  });
  return row;
}

/** A tipster's own announcements (active first, soonest drop first). */
export async function listMineAnnouncements(
  prisma: PrismaClient,
  tipsterId: string,
): Promise<PublicAnnouncement[]> {
  const rows = (await prisma.tipDropAnnouncement.findMany({
    where: { tipsterId },
    orderBy: [{ status: 'asc' }, { nextDropAt: 'asc' }, { createdAt: 'desc' }],
  })) as AnnouncementRow[];
  return rows.map(toPublicAnnouncement);
}

/**
 * Upcoming scheduled drops for a subscriber: active, still-future announcements
 * from tipsters they follow or actively subscribe to. Only timing is surfaced —
 * never gated pick content.
 */
export async function listUpcomingAnnouncements(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<PublicAnnouncement[]> {
  const [subs, follows] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId, status: 'active' },
      select: { tipsterId: true },
    }),
    prisma.follow.findMany({
      where: { userId },
      select: { tipsterId: true },
    }),
  ]);
  const tipsterIds = [
    ...new Set([
      ...subs.map((s) => s.tipsterId),
      ...follows.map((f) => f.tipsterId),
    ]),
  ];
  if (tipsterIds.length === 0) return [];

  const rows = (await prisma.tipDropAnnouncement.findMany({
    where: {
      tipsterId: { in: tipsterIds },
      status: 'active',
      nextDropAt: { gte: now },
    },
    orderBy: { nextDropAt: 'asc' },
  })) as AnnouncementRow[];
  return rows.map(toPublicAnnouncement);
}

/**
 * Fan out an announcement to the tipster's active subscribers over both
 * channels, honouring per-user preferences and one-click unsubscribe. Guarded
 * by `announcedAt` / `reminderSentAt` so repeated dispatch (e.g. redelivered
 * queue jobs) is idempotent — a second call sends nothing. Returns the number
 * of subscribers notified on this call (0 when already sent or canceled).
 */
export async function fanOutAnnouncement(
  prisma: PrismaClient,
  id: string,
  kind: 'published' | 'reminder',
  deps: AnnouncementFanOutDeps,
): Promise<number> {
  const row = (await prisma.tipDropAnnouncement.findUnique({
    where: { id },
    include: { tipster: { select: { displayName: true } } },
  })) as
    | (AnnouncementRow & { tipster: { displayName: string | null } })
    | null;
  if (!row || row.status !== 'active') return 0;

  // Idempotency guard: skip if this kind of fan-out already went out.
  if (kind === 'published' && row.announcedAt) return 0;
  if (kind === 'reminder' && row.reminderSentAt) return 0;

  const recipients = await deps.loadRecipients(prisma, row.tipsterId);
  const template = deps.buildEmail({
    tipsterId: row.tipsterId,
    tipsterName: row.tipster.displayName,
    title: row.title,
    message: row.message,
    dropAt: row.nextDropAt,
    timezone: row.timezone,
    kind,
  });
  const notified = await deps.dispatch(
    deps.notifier,
    template,
    recipients,
    deps.baseUrl,
  );

  await prisma.tipDropAnnouncement.update({
    where: { id },
    data:
      kind === 'published'
        ? { announcedAt: new Date() }
        : { reminderSentAt: new Date() },
  });

  return notified;
}
