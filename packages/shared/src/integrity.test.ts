import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizePick,
  generateNonce,
  hashPick,
  verifyPick,
  type PickPayload,
} from './integrity.ts';

const payload: PickPayload = {
  tipsterId: 'tip_1',
  eventId: 'evt_1',
  market: '1X2',
  selection: 'home',
  oddsAtPick: 2.1,
  stakeUnits: 1,
};

test('canonicalizePick is deterministic and field-ordered', () => {
  assert.equal(canonicalizePick(payload), 'tip_1|evt_1|1X2|home|2.1|1');
});

test('hashPick verifies against the same payload/nonce/pepper', () => {
  const nonce = generateNonce();
  const hash = hashPick(payload, nonce, 'pepper');
  assert.ok(verifyPick(payload, nonce, 'pepper', hash));
});

test('tampering with any field breaks verification', () => {
  const nonce = generateNonce();
  const hash = hashPick(payload, nonce, 'pepper');
  const tampered = { ...payload, selection: 'away' };
  assert.equal(verifyPick(tampered, nonce, 'pepper', hash), false);
});

test('a different pepper breaks verification', () => {
  const nonce = generateNonce();
  const hash = hashPick(payload, nonce, 'pepper');
  assert.equal(verifyPick(payload, nonce, 'other-pepper', hash), false);
});

test('nonces are unique', () => {
  assert.notEqual(generateNonce(), generateNonce());
});
