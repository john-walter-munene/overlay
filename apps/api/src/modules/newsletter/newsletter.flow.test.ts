import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmFlow,
  sendWeeklyDigestFlow,
  subscribeFlow,
  unsubscribeFlow,
} from './newsletter.ts';

interface Row {
  id: string;
  email: string;
  status: string;
  confirmToken: string | null;
  unsubscribeToken: string;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Minimal in-memory Prisma stub covering the calls the flow makes. */
function fakePrisma(picks: any[] = []) {
  const rows: Row[] = [];
  let seq = 0;
  const findBy = (where: any): Row | undefined => {
    if (where.id != null) return rows.find((r) => r.id === where.id);
    if (where.email != null) return rows.find((r) => r.email === where.email);
    if (where.confirmToken != null)
      return rows.find((r) => r.confirmToken === where.confirmToken);
    if (where.unsubscribeToken != null)
      return rows.find((r) => r.unsubscribeToken === where.unsubscribeToken);
    return undefined;
  };
  const prisma = {
    rows,
    newsletterSubscriber: {
      async findUnique({ where }: any) {
        return findBy(where) ?? null;
      },
      async upsert({ where, update, create }: any) {
        const existing = findBy(where);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return existing;
        }
        const row: Row = {
          id: `n${++seq}`,
          email: create.email,
          status: create.status ?? 'pending',
          confirmToken: create.confirmToken ?? null,
          unsubscribeToken: create.unsubscribeToken,
          confirmedAt: create.confirmedAt ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        rows.push(row);
        return row;
      },
      async update({ where, data }: any) {
        const row = findBy(where);
        if (!row) throw new Error('not found');
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
      async findMany({ where }: any = {}) {
        const status = where?.status;
        return rows.filter((r) => (status ? r.status === status : true));
      },
    },
    pick: {
      async findMany() {
        return picks;
      },
    },
  };
  return prisma;
}

/** Mailer stub recording every email sent. */
function fakeMailer() {
  const emails: { to: string; subject: string; body: string }[] = [];
  return {
    emails,
    async sendEmail(to: string, subject: string, body: string) {
      emails.push({ to, subject, body });
    },
  };
}

const BASE = 'https://overlay.test';

function listSubscribed(prisma: any): Row[] {
  return prisma.rows.filter((r: Row) => r.status === 'subscribed');
}

test('subscribe stores a pending row and emails a confirmation link (double opt-in)', async () => {
  const prisma = fakePrisma();
  const mailer = fakeMailer();

  const result = await subscribeFlow(prisma as any, mailer, BASE, '  Alice@Example.COM ');
  assert.equal(result, 'ok');

  assert.equal(prisma.rows.length, 1);
  const row = prisma.rows[0];
  assert.equal(row.email, 'alice@example.com');
  assert.equal(row.status, 'pending');
  assert.ok(row.confirmToken, 'a confirm token is stored');
  assert.ok(row.unsubscribeToken, 'an unsubscribe token is stored');
  assert.equal(row.confirmedAt, null);

  // Pending subscribers are not yet confirmed.
  assert.equal(listSubscribed(prisma).length, 0);

  // The confirmation email carries the confirm link with the token.
  assert.equal(mailer.emails.length, 1);
  assert.match(mailer.emails[0].subject, /confirm/i);
  assert.ok(
    mailer.emails[0].body.includes(`/newsletter/confirm?token=${row.confirmToken}`),
  );
});

test('subscribe rejects invalid emails', async () => {
  const prisma = fakePrisma();
  const mailer = fakeMailer();
  assert.equal(await subscribeFlow(prisma as any, mailer, BASE, 'nope'), 'invalid');
  assert.equal(prisma.rows.length, 0);
  assert.equal(mailer.emails.length, 0);
});

test('subscribe -> confirm -> appears in the subscribed list', async () => {
  const prisma = fakePrisma();
  const mailer = fakeMailer();
  await subscribeFlow(prisma as any, mailer, BASE, 'bob@example.com');
  const token = prisma.rows[0].confirmToken!;

  assert.equal(await confirmFlow(prisma as any, mailer, token), 'ok');

  const row = prisma.rows[0];
  assert.equal(row.status, 'subscribed');
  assert.ok(row.confirmedAt instanceof Date, 'consent timestamp recorded');
  assert.equal(row.confirmToken, null, 'confirm token cleared after use');

  const subscribed = listSubscribed(prisma);
  assert.equal(subscribed.length, 1);
  assert.equal(subscribed[0].email, 'bob@example.com');
});

test('confirm reports unknown tokens', async () => {
  const prisma = fakePrisma();
  const mailer = fakeMailer();
  assert.equal(await confirmFlow(prisma as any, mailer, 'nope'), 'unknown');
  assert.equal(await confirmFlow(prisma as any, mailer, '   '), 'invalid');
});

test('unsubscribe removes the address from the subscribed list', async () => {
  const prisma = fakePrisma();
  const mailer = fakeMailer();
  await subscribeFlow(prisma as any, mailer, BASE, 'carol@example.com');
  await confirmFlow(prisma as any, mailer, prisma.rows[0].confirmToken!);
  const token = prisma.rows[0].unsubscribeToken;

  assert.equal(await unsubscribeFlow(prisma as any, token), 'ok');

  assert.equal(prisma.rows[0].status, 'unsubscribed');
  assert.equal(listSubscribed(prisma).length, 0);
});

test('subscribe is idempotent for an already-confirmed address (no duplicate, no re-send)', async () => {
  const prisma = fakePrisma();
  const mailer = fakeMailer();
  await subscribeFlow(prisma as any, mailer, BASE, 'dave@example.com');
  await confirmFlow(prisma as any, mailer, prisma.rows[0].confirmToken!);
  const before = mailer.emails.length;

  assert.equal(await subscribeFlow(prisma as any, mailer, BASE, 'dave@example.com'), 'ok');

  assert.equal(prisma.rows.length, 1);
  assert.equal(prisma.rows[0].status, 'subscribed');
  assert.equal(mailer.emails.length, before, 'no extra email sent');
});

test('weekly digest is sent only to confirmed subscribers; opted-out receive nothing', async () => {
  const picks = [
    {
      market: 'Match Odds',
      selection: 'Home',
      oddsAtPick: 2.1,
      tipster: { displayName: 'Ada', user: { username: 'ada' } },
    },
  ];
  const prisma = fakePrisma(picks);
  const mailer = fakeMailer();

  // confirmed subscriber
  await subscribeFlow(prisma as any, mailer, BASE, 'sub@example.com');
  await confirmFlow(
    prisma as any,
    mailer,
    prisma.rows.find((r) => r.email === 'sub@example.com')!.confirmToken!,
  );
  // pending (never confirmed) subscriber
  await subscribeFlow(prisma as any, mailer, BASE, 'pending@example.com');
  // unsubscribed subscriber
  await subscribeFlow(prisma as any, mailer, BASE, 'gone@example.com');
  const goneRow = prisma.rows.find((r) => r.email === 'gone@example.com')!;
  await confirmFlow(prisma as any, mailer, goneRow.confirmToken!);
  await unsubscribeFlow(prisma as any, goneRow.unsubscribeToken);

  mailer.emails.length = 0; // ignore confirmation/welcome emails

  const result = await sendWeeklyDigestFlow(prisma as any, mailer, BASE);
  assert.equal(result.picks, 1);
  assert.equal(result.sent, 1);

  const digests = mailer.emails.filter((e) => /Picks of the Week/.test(e.subject));
  assert.equal(digests.length, 1);
  assert.equal(digests[0].to, 'sub@example.com');
  assert.match(digests[0].body, /Ada: Match Odds/);
  assert.match(digests[0].body, /Unsubscribe \(one click\)/);
});

test('weekly digest sends nothing when there are no picks', async () => {
  const prisma = fakePrisma([]);
  const mailer = fakeMailer();
  await subscribeFlow(prisma as any, mailer, BASE, 'x@example.com');
  await confirmFlow(prisma as any, mailer, prisma.rows[0].confirmToken!);

  assert.deepEqual(await sendWeeklyDigestFlow(prisma as any, mailer, BASE), {
    sent: 0,
    picks: 0,
  });
});
