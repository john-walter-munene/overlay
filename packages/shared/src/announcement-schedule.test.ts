import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidTimezone,
  parseTimeOfDay,
  resolveNextDropAt,
  toPublicAnnouncement,
  type AnnouncementRecord,
} from './announcement-schedule.ts';

test('parseTimeOfDay: accepts valid 24h times, rejects junk', () => {
  assert.deepEqual(parseTimeOfDay('18:00'), { hour: 18, minute: 0 });
  assert.deepEqual(parseTimeOfDay('00:05'), { hour: 0, minute: 5 });
  assert.deepEqual(parseTimeOfDay('23:59'), { hour: 23, minute: 59 });
  assert.equal(parseTimeOfDay('24:00'), null);
  assert.equal(parseTimeOfDay('7:5'), null);
  assert.equal(parseTimeOfDay('18:60'), null);
  assert.equal(parseTimeOfDay(''), null);
  assert.equal(parseTimeOfDay(undefined), null);
});

test('isValidTimezone: recognises IANA zones, rejects garbage', () => {
  assert.equal(isValidTimezone('Africa/Nairobi'), true);
  assert.equal(isValidTimezone('America/New_York'), true);
  assert.equal(isValidTimezone('UTC'), true);
  assert.equal(isValidTimezone('Not/AZone'), false);
  assert.equal(isValidTimezone(''), false);
  assert.equal(isValidTimezone(null), false);
});

test('resolveNextDropAt: one-off resolves the wall-clock time in its timezone', () => {
  // 18:00 in EAT (UTC+3, no DST) => 15:00 UTC on the same day.
  const now = new Date('2026-07-01T00:00:00Z');
  const at = resolveNextDropAt(
    {
      recurrence: 'one_off',
      timezone: 'Africa/Nairobi',
      timeOfDay: '18:00',
      date: '2026-07-10',
    },
    now,
  );
  assert.equal(at?.toISOString(), '2026-07-10T15:00:00.000Z');
});

test('resolveNextDropAt: a past one-off has no next drop', () => {
  const now = new Date('2026-07-11T00:00:00Z');
  const at = resolveNextDropAt(
    {
      recurrence: 'one_off',
      timezone: 'Africa/Nairobi',
      timeOfDay: '18:00',
      date: '2026-07-10',
    },
    now,
  );
  assert.equal(at, null);
});

test('resolveNextDropAt: daily picks today when the time is still ahead', () => {
  // now = 10:00 UTC = 13:00 EAT; 18:00 EAT is still ahead today.
  const now = new Date('2026-07-10T10:00:00Z');
  const at = resolveNextDropAt(
    { recurrence: 'daily', timezone: 'Africa/Nairobi', timeOfDay: '18:00' },
    now,
  );
  assert.equal(at?.toISOString(), '2026-07-10T15:00:00.000Z');
});

test('resolveNextDropAt: daily rolls to tomorrow once today has passed', () => {
  // now = 16:00 UTC = 19:00 EAT; 18:00 EAT already passed today.
  const now = new Date('2026-07-10T16:00:00Z');
  const at = resolveNextDropAt(
    { recurrence: 'daily', timezone: 'Africa/Nairobi', timeOfDay: '18:00' },
    now,
  );
  assert.equal(at?.toISOString(), '2026-07-11T15:00:00.000Z');
});

test('resolveNextDropAt: weekly finds the next matching weekday', () => {
  // 2026-07-10 is a Friday. Next Wednesday (3) is 2026-07-15.
  const now = new Date('2026-07-10T10:00:00Z');
  const at = resolveNextDropAt(
    {
      recurrence: 'weekly',
      timezone: 'Africa/Nairobi',
      timeOfDay: '18:00',
      weekday: 3,
    },
    now,
  );
  assert.equal(at?.toISOString(), '2026-07-15T15:00:00.000Z');
});

test('resolveNextDropAt: weekly same-day-but-passed rolls to next week', () => {
  // 2026-07-10 is a Friday (5); 18:00 EAT already passed at 19:00 EAT now.
  const now = new Date('2026-07-10T16:00:00Z');
  const at = resolveNextDropAt(
    {
      recurrence: 'weekly',
      timezone: 'Africa/Nairobi',
      timeOfDay: '18:00',
      weekday: 5,
    },
    now,
  );
  assert.equal(at?.toISOString(), '2026-07-17T15:00:00.000Z');
});

test('resolveNextDropAt: honours DST in a zone that observes it', () => {
  // London is on BST (UTC+1) in July, so 09:00 local => 08:00 UTC.
  const now = new Date('2026-07-01T00:00:00Z');
  const at = resolveNextDropAt(
    {
      recurrence: 'one_off',
      timezone: 'Europe/London',
      timeOfDay: '09:00',
      date: '2026-07-15',
    },
    now,
  );
  assert.equal(at?.toISOString(), '2026-07-15T08:00:00.000Z');

  // In January London is on GMT (UTC+0), so 09:00 local => 09:00 UTC.
  const winter = resolveNextDropAt(
    {
      recurrence: 'one_off',
      timezone: 'Europe/London',
      timeOfDay: '09:00',
      date: '2026-01-15',
    },
    new Date('2026-01-01T00:00:00Z'),
  );
  assert.equal(winter?.toISOString(), '2026-01-15T09:00:00.000Z');
});

test('resolveNextDropAt: invalid spec returns null', () => {
  const now = new Date('2026-07-10T10:00:00Z');
  assert.equal(
    resolveNextDropAt(
      { recurrence: 'daily', timezone: 'Not/AZone', timeOfDay: '18:00' },
      now,
    ),
    null,
  );
  assert.equal(
    resolveNextDropAt(
      { recurrence: 'daily', timezone: 'UTC', timeOfDay: '99:99' },
      now,
    ),
    null,
  );
  assert.equal(
    resolveNextDropAt(
      { recurrence: 'weekly', timezone: 'UTC', timeOfDay: '18:00', weekday: 9 },
      now,
    ),
    null,
  );
});

test('toPublicAnnouncement: serializes without leaking internal columns', () => {
  const row: AnnouncementRecord = {
    id: 'a1',
    tipsterId: 't1',
    title: 'Daily tips at 18:00 EAT',
    message: 'Big weekend slate coming.',
    timezone: 'Africa/Nairobi',
    recurrence: 'daily',
    timeOfDay: '18:00',
    dropDate: null,
    weekday: null,
    reminderMinutes: 30,
    nextDropAt: new Date('2026-07-10T15:00:00.000Z'),
    status: 'active',
  };
  const view = toPublicAnnouncement(row);
  assert.deepEqual(view, {
    id: 'a1',
    tipsterId: 't1',
    title: 'Daily tips at 18:00 EAT',
    message: 'Big weekend slate coming.',
    timezone: 'Africa/Nairobi',
    recurrence: 'daily',
    timeOfDay: '18:00',
    date: null,
    weekday: null,
    reminderMinutes: 30,
    nextDropAt: '2026-07-10T15:00:00.000Z',
    status: 'active',
  });
  // No pick fields ever leak through the public shape.
  assert.ok(!('market' in view));
  assert.ok(!('selection' in view));
  assert.ok(!('oddsAtPick' in view));
});
