// Integration test (OB-092): readiness reports `degraded` when the database is
// unreachable. Unlike the pure unit tests, this exercises the real probe path
// against a live Prisma client pointed at an unroutable host, proving the DB
// health check surfaces connectivity failures as `down` rather than throwing.
//
// It intentionally uses an unreachable DATABASE_URL so it needs no running
// Postgres and asserts the "DB down" branch the acceptance criteria calls for.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { evaluateReadiness } from './health.checks.ts';

// RFC 5737 TEST-NET-1 address: guaranteed non-routable, so the connection fails
// fast without depending on anything being (or not being) up on localhost.
const UNREACHABLE_DB_URL =
  '******192.0.2.1:5432/overlay?schema=public&connect_timeout=1';

test('readiness degrades when the database is down', async () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: UNREACHABLE_DB_URL } },
  });

  try {
    const result = await evaluateReadiness(
      {
        database: () => prisma.$queryRaw`SELECT 1`,
        // Stub Redis as healthy so the DB is the only failing dependency.
        redis: async () => 'PONG',
      },
      1_500,
    );

    assert.equal(result.status, 'degraded');
    assert.equal(result.checks.database, 'down');
    assert.equal(result.checks.redis, 'ok');
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
});
