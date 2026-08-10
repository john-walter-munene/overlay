/**
 * Remove seeded placeholder fixtures now that real vendor data is ingested.
 *
 * Seeded demo events all use a `seed-` vendorEventId prefix; real ingested
 * events look like `soccer_epl:<hash>`. Upcoming placeholders (Arsenal vs
 * Chelsea, etc.) use `seed-evt-*` and are future-dated; the finished demo
 * fixtures that back the sample tipsters' leaderboard history use `seed-past-*`.
 *
 * By default this deletes only the UPCOMING seed events (`seed-` + startTime in
 * the future) plus any picks on them, so the demo leaderboard history stays
 * intact. Pass `--all-seed` to also remove the past demo fixtures (this makes
 * the sample tipsters' settled stats stale — recompute or drop them separately).
 *
 * Usage:
 *   node scripts/cleanup-seed-events.mjs --dry-run     # preview, deletes nothing
 *   node scripts/cleanup-seed-events.mjs               # delete upcoming seed events
 *   node scripts/cleanup-seed-events.mjs --all-seed    # + past demo fixtures
 *
 * Safe to run more than once (idempotent). Requires DATABASE_URL to point at the
 * target database.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ALL_SEED = args.includes('--all-seed');

async function main() {
  const where = ALL_SEED
    ? { vendorEventId: { startsWith: 'seed-' } }
    : { vendorEventId: { startsWith: 'seed-' }, startTime: { gt: new Date() } };

  const events = await prisma.event.findMany({
    where,
    select: { id: true, vendorEventId: true, home: true, away: true, startTime: true },
    orderBy: { startTime: 'asc' },
  });

  if (events.length === 0) {
    console.log('✓ No seed placeholder events found — nothing to remove.');
    return;
  }

  const eventIds = events.map((e) => e.id);
  const pickCount = await prisma.pick.count({ where: { eventId: { in: eventIds } } });

  console.log(
    `Found ${events.length} seed event(s)${ALL_SEED ? ' (including past demo fixtures)' : ' (upcoming only)'} ` +
      `and ${pickCount} pick(s) referencing them:`,
  );
  for (const e of events) {
    console.log(`  · ${e.home} vs ${e.away}  [${e.vendorEventId}]  ${e.startTime.toISOString()}`);
  }

  if (DRY_RUN) {
    console.log('\n— dry run — nothing was deleted. Re-run without --dry-run to apply.');
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const picks = await tx.pick.deleteMany({ where: { eventId: { in: eventIds } } });
    const evs = await tx.event.deleteMany({ where: { id: { in: eventIds } } });
    return { picks: picks.count, events: evs.count };
  });

  console.log(`\n✓ Deleted ${result.events} event(s) and ${result.picks} pick(s).`);
  if (ALL_SEED && result.picks > 0) {
    console.log(
      '⚠ Past demo picks were removed — the sample tipsters\u2019 settled stats are now stale. ' +
        'Recompute stats or remove the demo tipsters separately.',
    );
  }
}

main()
  .catch((err) => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
