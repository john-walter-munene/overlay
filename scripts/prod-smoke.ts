/**
 * Deployment smoke test for the Overlay Bets API (OB-101). Verifies that a
 * freshly deployed environment is actually serving traffic over HTTPS:
 *
 *   1. GET /api/health        — liveness (never touches a dependency)
 *   2. GET /api/health/ready  — readiness (proves Postgres + Redis are reachable,
 *                               i.e. migrations ran and the datastores are wired)
 *   3. GET /api/leaderboard   — a public, unauthenticated endpoint returns data
 *
 * DB-free: it only makes HTTP requests against the deployed base URL, so it can
 * run from CI or a laptop right after a deploy with no local Postgres/Redis.
 *
 * Usage (base URL from the env, defaulting to local dev):
 *   SMOKE_BASE_URL=https://overlay-api.onrender.com \
 *     node --experimental-strip-types scripts/prod-smoke.ts
 *
 * Falls back to PUBLIC_API_URL, then NEXT_PUBLIC_API_URL, then
 * http://localhost:4000. Exits non-zero on the first failed check.
 */

const BASE = (
  process.env.SMOKE_BASE_URL ??
  process.env.PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000'
).replace(/\/+$/, '');

// Total per-request budget: cold starts on free tiers can be slow.
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 30_000);

let failures = 0;

async function fetchJson(
  path: string,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      // Non-JSON body — keep the raw text so failures show what came back.
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function check(
  name: string,
  path: string,
  assert: (r: { status: number; body: unknown }) => string | null,
): Promise<void> {
  process.stdout.write(`• ${name} (GET ${path}) ... `);
  try {
    const res = await fetchJson(path);
    const problem = assert(res);
    if (problem) {
      failures += 1;
      console.log(`FAIL — ${problem}`);
    } else {
      console.log(`ok (${res.status})`);
    }
  } catch (err) {
    failures += 1;
    console.log(`FAIL — ${(err as Error).message}`);
  }
}

console.log(`\n=== Overlay API smoke test · ${BASE} ===\n`);

// 1) Liveness: 200 + { status: "ok" }.
await check('health (liveness)', '/api/health', ({ status, body }) => {
  if (status !== 200) return `expected 200, got ${status}`;
  const s = (body as { status?: unknown })?.status;
  if (s !== 'ok') return `expected status "ok", got ${JSON.stringify(s)}`;
  return null;
});

// 2) Readiness: 200 means Postgres + Redis are reachable (migrations applied).
await check('health (readiness)', '/api/health/ready', ({ status, body }) => {
  if (status !== 200) {
    return `expected 200, got ${status} (deps down?) — ${JSON.stringify(body)}`;
  }
  return null;
});

// 3) Public endpoint: the leaderboard needs no auth and returns an array.
await check('public endpoint', '/api/leaderboard', ({ status, body }) => {
  if (status !== 200) return `expected 200, got ${status}`;
  if (!Array.isArray(body)) return `expected a JSON array, got ${typeof body}`;
  return null;
});

if (failures > 0) {
  console.log(`\n=== FAILED (${failures} check(s)) ===\n`);
  process.exit(1);
}
console.log('\n=== all checks passed ===\n');
