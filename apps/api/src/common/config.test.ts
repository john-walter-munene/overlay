import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_SECRET_LENGTH,
  collectConfigProblems,
  validateEnv,
} from './config.ts';

/** A fully-valid production-shaped environment we can selectively break. */
function goodEnv(): NodeJS.ProcessEnv {
  const strong = 'a'.repeat(MIN_SECRET_LENGTH);
  return {
    NODE_ENV: 'production',
    DATABASE_URL: '******localhost:5432/overlay',
    SUPABASE_URL: 'https://example.supabase.co',
    JWT_SECRET: strong,
    PICK_HASH_PEPPER: 'b'.repeat(MIN_SECRET_LENGTH),
  } as NodeJS.ProcessEnv;
}

test('collectConfigProblems: clean env yields no problems', () => {
  assert.deepEqual(collectConfigProblems(goodEnv()), []);
});

test('collectConfigProblems: flags the documented default secrets', () => {
  const env = { ...goodEnv(), JWT_SECRET: 'change-me-in-prod', PICK_HASH_PEPPER: 'change-me' };
  const problems = collectConfigProblems(env);
  assert.ok(problems.some((p) => p.includes('JWT_SECRET') && p.includes('default')));
  assert.ok(problems.some((p) => p.includes('PICK_HASH_PEPPER') && p.includes('default')));
});

test('collectConfigProblems: default detection is case-insensitive and trims', () => {
  const env = { ...goodEnv(), PICK_HASH_PEPPER: '  Change-Me  ' };
  assert.ok(collectConfigProblems(env).some((p) => p.includes('PICK_HASH_PEPPER')));
});

test('collectConfigProblems: flags weak (too-short) secrets', () => {
  const env = { ...goodEnv(), JWT_SECRET: 'short' };
  assert.ok(collectConfigProblems(env).some((p) => p.includes('JWT_SECRET') && p.includes('weak')));
});

test('collectConfigProblems: flags missing secrets and required vars', () => {
  const env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
  const problems = collectConfigProblems(env);
  assert.ok(problems.some((p) => p.includes('DATABASE_URL')));
  assert.ok(problems.some((p) => p.includes('SUPABASE_URL')));
  assert.ok(problems.some((p) => p.includes('JWT_SECRET')));
  assert.ok(problems.some((p) => p.includes('PICK_HASH_PEPPER')));
});

test('collectConfigProblems: requires stripe secrets when provider=stripe', () => {
  const env = { ...goodEnv(), PAYMENTS_PROVIDER: 'stripe' };
  const problems = collectConfigProblems(env);
  assert.ok(problems.some((p) => p.includes('STRIPE_SECRET_KEY')));
  assert.ok(problems.some((p) => p.includes('STRIPE_WEBHOOK_SECRET')));
});

test('boot guard REJECTS default secrets when NODE_ENV=production', () => {
  const env = { ...goodEnv(), JWT_SECRET: 'change-me-in-prod', PICK_HASH_PEPPER: 'change-me' };
  assert.throws(
    () => validateEnv(env),
    /Refusing to start with an insecure configuration/,
  );
});

test('boot guard REJECTS weak secrets when NODE_ENV=production', () => {
  const env = { ...goodEnv(), PICK_HASH_PEPPER: 'tooshort' };
  assert.throws(
    () => validateEnv(env),
    /Refusing to start with an insecure configuration/,
  );
});

test('boot guard accepts strong secrets in production', () => {
  assert.doesNotThrow(() => validateEnv(goodEnv()));
});

test('boot guard only WARNS (does not throw) outside production', () => {
  const env = { ...goodEnv(), NODE_ENV: 'development', JWT_SECRET: 'change-me-in-prod' };
  assert.doesNotThrow(() => validateEnv(env));
});
