import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  locales,
  defaultLocale,
  isLocale,
  resolveLocale,
} from '../i18n/config.ts';
import en from '../messages/en.json' with { type: 'json' };
import fr from '../messages/fr.json' with { type: 'json' };
import es from '../messages/es.json' with { type: 'json' };
import pt from '../messages/pt.json' with { type: 'json' };
import de from '../messages/de.json' with { type: 'json' };
import nl from '../messages/nl.json' with { type: 'json' };
import zh from '../messages/zh.json' with { type: 'json' };
import tr from '../messages/tr.json' with { type: 'json' };

test('locales list matches the supported set and includes the default', () => {
  assert.deepEqual([...locales], ['en', 'fr', 'es', 'pt', 'de', 'nl', 'zh', 'tr']);
  assert.ok(locales.includes(defaultLocale));
});

test('isLocale validates membership', () => {
  assert.equal(isLocale('fr'), true);
  assert.equal(isLocale('xx'), false);
  assert.equal(isLocale(undefined), false);
  assert.equal(isLocale(null), false);
});

test('resolveLocale returns the locale when supported, else the default', () => {
  assert.equal(resolveLocale('de'), 'de');
  assert.equal(resolveLocale('xx'), defaultLocale);
  assert.equal(resolveLocale(undefined), defaultLocale);
});

/** Flatten nested message keys into dotted paths for comparison. */
function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object'
      ? flatKeys(v as Record<string, unknown>, path)
      : [path];
  });
}

test('every locale catalog has the exact same keys as English', () => {
  const base = flatKeys(en).sort();
  for (const [name, cat] of [
    ['fr', fr],
    ['es', es],
    ['pt', pt],
    ['de', de],
    ['nl', nl],
    ['zh', zh],
    ['tr', tr],
  ] as const) {
    assert.deepEqual(
      flatKeys(cat).sort(),
      base,
      `${name}.json keys must match en.json`,
    );
  }
});
