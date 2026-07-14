// Seed script — run with: node prisma/seed.mjs
// Requires `npm run prisma:generate` first and DATABASE_URL to be set.
import { PrismaClient } from '@prisma/client';
import { scryptSync, randomBytes } from 'node:crypto';
import {
  generateNonce,
  hashPick,
  computeTipsterStats,
} from '@overlay/shared';

const prisma = new PrismaClient();

const PICK_PEPPER = process.env.PICK_HASH_PEPPER ?? 'dev-pepper';

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function readingMinutes(body) {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 225));
}

const round2 = (n) => Math.round(n * 100) / 100;

/** Small deterministic PRNG so re-seeding produces the same dummy history. */
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@overlay.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'change-me-now';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Upcoming fixtures so a fresh install has something for tipsters to pick on
// without an admin having to run the ingest endpoint first. Start times are
// relative to seed time so they stay in the future.
const EVENTS = [
  {
    vendorEventId: 'seed-evt-epl-1',
    sport: 'soccer',
    league: 'Premier League',
    home: 'Arsenal',
    away: 'Chelsea',
    startTime: new Date(Date.now() + 3 * HOUR),
  },
  {
    vendorEventId: 'seed-evt-epl-2',
    sport: 'soccer',
    league: 'Premier League',
    home: 'Manchester City',
    away: 'Liverpool',
    startTime: new Date(Date.now() + 27 * HOUR),
  },
  {
    vendorEventId: 'seed-evt-nba-1',
    sport: 'basketball',
    league: 'NBA',
    home: 'Boston Celtics',
    away: 'Los Angeles Lakers',
    startTime: new Date(Date.now() + 6 * HOUR),
  },
];

const TIPSTER_PASSWORD = process.env.SEED_TIPSTER_PASSWORD ?? 'change-me-now';

// Finished fixtures that historical (settled) picks reference.
const SOCCER_TEAMS = [
  'Arsenal', 'Chelsea', 'Tottenham', 'Manchester United', 'Newcastle',
  'Aston Villa', 'Brighton', 'West Ham', 'Everton', 'Fulham',
  'Crystal Palace', 'Wolves',
];
const BASKETBALL_TEAMS = [
  'Milwaukee Bucks', 'Miami Heat', 'Denver Nuggets', 'Phoenix Suns',
  'Golden State Warriors', 'Dallas Mavericks', 'Philadelphia 76ers', 'New York Knicks',
];

function buildPastEvents() {
  const events = [];
  for (let i = 0; i < 12; i++) {
    const home = SOCCER_TEAMS[(i * 2) % SOCCER_TEAMS.length];
    const away = SOCCER_TEAMS[(i * 2 + 1) % SOCCER_TEAMS.length];
    events.push({
      vendorEventId: `seed-past-soccer-${i + 1}`,
      sport: 'soccer',
      league: 'Premier League',
      home,
      away,
      startTime: new Date(Date.now() - (i + 2) * DAY),
      status: 'finished',
    });
  }
  for (let i = 0; i < 8; i++) {
    const home = BASKETBALL_TEAMS[(i * 2) % BASKETBALL_TEAMS.length];
    const away = BASKETBALL_TEAMS[(i * 2 + 1) % BASKETBALL_TEAMS.length];
    events.push({
      vendorEventId: `seed-past-nba-${i + 1}`,
      sport: 'basketball',
      league: 'NBA',
      home,
      away,
      startTime: new Date(Date.now() - (i + 2) * DAY),
      status: 'finished',
    });
  }
  return events;
}

// Dummy tipsters with distinct quality profiles. `count` settled picks each
// (all >= the leaderboard's min sample of 10 so they appear immediately).
const DUMMY_TIPSTERS = [
  { email: 'sharpshooter@overlay.local', bio: 'Data-driven soccer sharp. Long-term CLV over hype.', sports: ['soccer'], priceCents: 2999, count: 24, winRate: 0.6, edge: 0.05 },
  { email: 'valuehunter@overlay.local', bio: 'Chasing overlays in midweek European fixtures.', sports: ['soccer'], priceCents: 1999, count: 18, winRate: 0.54, edge: 0.03 },
  { email: 'hoopsanalyst@overlay.local', bio: 'NBA totals and moneyline specialist.', sports: ['basketball'], priceCents: 2499, count: 16, winRate: 0.52, edge: 0.02 },
  { email: 'steadyeddie@overlay.local', bio: 'Low-variance flat-staking. Consistency first.', sports: ['soccer', 'basketball'], priceCents: 1499, count: 14, winRate: 0.57, edge: 0.04 },
  { email: 'longshotlarry@overlay.local', bio: 'High-odds underdog hunter. Not for the faint-hearted.', sports: ['soccer'], priceCents: 999, count: 20, winRate: 0.4, edge: -0.01 },
];

/**
 * Generate a deterministic settled-pick history for one tipster.
 * Returns { pickRows, settledForStats } where pickRows are Prisma create
 * inputs and settledForStats feeds the shared stats engine.
 */
function buildPicksForTipster(tipster, tipsterId, pastEvents) {
  const rnd = mulberry32(seedFromString(tipster.email));
  const relevant = pastEvents.filter((e) => tipster.sports.includes(e.sport));
  const events = relevant.length > 0 ? relevant : pastEvents;
  const selections = ['home', 'draw', 'away'];

  const pickRows = [];
  const settledForStats = [];

  for (let i = 0; i < tipster.count; i++) {
    const event = events[i % events.length];
    const selection = selections[Math.floor(rnd() * selections.length)];
    const oddsAtPick = round2(1.7 + rnd() * 1.6); // 1.70 – 3.30
    const stakeUnits = 1 + Math.floor(rnd() * 3); // 1 – 3

    const isVoid = rnd() < 0.05;
    const isWin = rnd() < tipster.winRate;
    const status = isVoid ? 'void' : isWin ? 'won' : 'lost';

    // Better tipsters beat the close: closingOdds shorter than oddsAtPick.
    const drift = tipster.edge + (rnd() - 0.5) * 0.06;
    const closingOdds = round2(oddsAtPick / (1 + drift));
    const clv = round2((oddsAtPick / closingOdds - 1) * 100) / 100;

    const settledAt = new Date(Date.now() - (tipster.count - i) * DAY);
    const lockedAt = new Date(settledAt.getTime() - 2 * HOUR);

    const payload = {
      tipsterId,
      eventId: event.id,
      market: '1X2',
      selection,
      oddsAtPick,
      stakeUnits,
    };
    const nonce = generateNonce();
    const hash = hashPick(payload, nonce, PICK_PEPPER);

    pickRows.push({
      tipsterId,
      eventId: event.id,
      market: '1X2',
      selection,
      oddsAtPick,
      stakeUnits,
      hash,
      nonce,
      lockedAt,
      status,
      closingOdds,
      clv,
      result: status === 'won' ? selection : null,
      settledAt,
    });

    settledForStats.push({
      oddsAtPick,
      stakeUnits,
      status,
      closingOdds,
      settledAt: settledAt.getTime(),
    });
  }

  return { pickRows, settledForStats };
}

const ARTICLES = [
  {
    slug: 'what-is-closing-line-value',
    title: 'What Is Closing Line Value (CLV) and Why It Predicts Long-Term Profit',
    tags: ['clv', 'strategy', 'fundamentals'],
    excerpt:
      'Closing line value measures whether you beat the market before it corrected. It is the single best leading indicator of a betting edge.',
    body: `## The one metric sharps actually track

Closing line value (CLV) compares the odds you got when you placed a bet to the
final odds right before the event started — the **closing line**.

If you consistently take prices better than the close, you are, on average,
getting **positive expected value**. The closing line is the market's most
efficient estimate of true probability, because it reflects all money and
information up to kickoff.

## How to calculate CLV

\`\`\`
CLV = (odds_at_bet / closing_odds) - 1
\`\`\`

- You bet a team at **2.10**.
- The line closes at **1.90**.
- CLV = 2.10 / 1.90 - 1 = **+10.5%**.

You beat the close by more than ten percent. Do that repeatedly and profit
follows, even across losing runs.

## Why CLV beats short-term ROI

ROI over a few hundred bets is dominated by variance. CLV is measurable on
**every** bet — win or lose — so it converges far faster. That is why Overlay
ranks tipsters on verified CLV, not just win rate.`,
  },
  {
    slug: 'expected-value-betting-explained',
    title: 'Expected Value Betting Explained: Finding the Overlay',
    tags: ['ev', 'strategy', 'fundamentals'],
    excerpt:
      'An overlay is a bet where the offered odds are longer than the true probability warrants. Here is how to spot one.',
    body: `## What "overlay" means

An **overlay** is a bet whose offered odds imply a probability *lower* than the
true probability of the outcome. In other words, the bookmaker is paying you
more than the risk deserves. That gap is your edge.

## Expected value in one formula

\`\`\`
EV = (p_true * (odds - 1)) - (1 - p_true)
\`\`\`

If your estimated true probability is 55% and the odds are 2.00:

- EV = 0.55 * 1.00 - 0.45 = **+0.10 per unit** (a 10% edge).

Positive EV is the whole game. Everything else — bankroll, CLV, staking — is how
you survive variance long enough to realize it.

## Where overlays come from

- Slow-moving soft books
- Overreactions to public narratives
- Injury/lineup news the price hasn't absorbed yet

Find them, bet them, and track your CLV to confirm you were right.`,
  },
  {
    slug: 'bankroll-management-kelly-criterion',
    title: 'Bankroll Management: Staking, Units, and the Kelly Criterion',
    tags: ['bankroll', 'strategy', 'risk'],
    excerpt:
      'A positive edge still busts you if you stake badly. Learn unit sizing and a practical, fractional-Kelly approach.',
    body: `## Edge without discipline goes broke

Even a genuine +EV bettor can lose their entire bankroll by staking too much on
each bet. Bankroll management is how you turn an edge into realized profit.

## Units, not dollars

Track everything in **units** — typically 1% of your bankroll. A "3-unit" bet is
three percent of your roll. This normalizes performance across bankroll sizes and
is exactly how Overlay records tipster stakes.

## The Kelly criterion

Kelly tells you the growth-optimal fraction to stake given your edge:

\`\`\`
f = (b * p - q) / b
\`\`\`

where \`b\` = odds - 1, \`p\` = true win probability, \`q\` = 1 - p.

Because your probability estimates are noisy, most pros bet **quarter- or
half-Kelly** to cut variance. Smaller, steadier, still growing.`,
  },
];

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: 'admin' },
    create: {
      email: ADMIN_EMAIL,
      role: 'admin',
      passwordHash: hashPassword(ADMIN_PASSWORD),
    },
  });
  console.log(`Admin user: ${admin.email}`);

  for (const a of ARTICLES) {
    await prisma.article.upsert({
      where: { slug: a.slug },
      update: {
        title: a.title,
        excerpt: a.excerpt,
        body: a.body,
        tags: a.tags,
        readingMinutes: readingMinutes(a.body),
        status: 'published',
      },
      create: {
        slug: a.slug,
        title: a.title,
        excerpt: a.excerpt,
        body: a.body,
        tags: a.tags,
        readingMinutes: readingMinutes(a.body),
        status: 'published',
        publishedAt: new Date(),
        authorId: admin.id,
      },
    });
    console.log(`Article: ${a.slug}`);
  }

  for (const e of EVENTS) {
    await prisma.event.upsert({
      where: { vendorEventId: e.vendorEventId },
      update: { startTime: e.startTime, status: 'scheduled' },
      create: {
        vendorEventId: e.vendorEventId,
        sport: e.sport,
        league: e.league,
        home: e.home,
        away: e.away,
        startTime: e.startTime,
      },
    });
    console.log(`Event: ${e.home} vs ${e.away}`);
  }

  // --- Dummy tipsters with settled pick history + materialized stats ---
  const pastEvents = buildPastEvents();
  const pastEventById = {};
  for (const e of pastEvents) {
    const row = await prisma.event.upsert({
      where: { vendorEventId: e.vendorEventId },
      update: { startTime: e.startTime, status: e.status },
      create: {
        vendorEventId: e.vendorEventId,
        sport: e.sport,
        league: e.league,
        home: e.home,
        away: e.away,
        startTime: e.startTime,
        status: e.status,
      },
    });
    e.id = row.id;
    pastEventById[e.vendorEventId] = row.id;
  }

  for (const t of DUMMY_TIPSTERS) {
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: { role: 'tipster' },
      create: {
        email: t.email,
        role: 'tipster',
        passwordHash: hashPassword(TIPSTER_PASSWORD),
      },
    });

    await prisma.tipster.upsert({
      where: { userId: user.id },
      update: {
        bio: t.bio,
        sports: t.sports,
        subscriptionPriceCents: t.priceCents,
        stripeOnboarded: true,
        identityVerified: true,
      },
      create: {
        userId: user.id,
        bio: t.bio,
        sports: t.sports,
        subscriptionPriceCents: t.priceCents,
        stripeOnboarded: true,
        identityVerified: true,
        status: 'active',
      },
    });

    // Rebuild this tipster's dummy picks idempotently.
    await prisma.pick.deleteMany({ where: { tipsterId: user.id } });

    const { pickRows, settledForStats } = buildPicksForTipster(t, user.id, pastEvents);
    await prisma.pick.createMany({ data: pickRows });

    const stats = computeTipsterStats(settledForStats);
    await prisma.tipsterStats.upsert({
      where: { tipsterId: user.id },
      create: { tipsterId: user.id, ...stats },
      update: stats,
    });

    console.log(
      `Tipster: ${t.email} — ${t.count} picks, ` +
        `yield ${stats.yield.toFixed(1)}%, win ${(stats.winRate * 100).toFixed(0)}%`,
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
