import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  flatten,
  getPath,
  missingPaths,
  stalePaths,
  rebuildFromSource,
  hashText,
  sourceHashes,
  changedPaths,
  globToRegExp,
  matchGlobs,
  parseArgs,
} from './i18n-sync.mjs';

const source = {
  nav: { home: 'Home', about: 'About' },
  home: { title: 'Hello', cta: 'Go {name}' },
};

test('flatten produces dotted leaf paths', () => {
  assert.deepEqual(flatten(source), {
    'nav.home': 'Home',
    'nav.about': 'About',
    'home.title': 'Hello',
    'home.cta': 'Go {name}',
  });
});

test('getPath reads nested values and returns undefined for absent paths', () => {
  assert.equal(getPath(source, 'nav.about'), 'About');
  assert.equal(getPath(source, 'nav.missing'), undefined);
  assert.equal(getPath(source, 'a.b.c'), undefined);
});

test('missingPaths lists source leaves absent from the target', () => {
  const target = { nav: { home: 'Accueil' }, home: { title: 'Bonjour' } };
  assert.deepEqual(missingPaths(source, target), ['nav.about', 'home.cta']);
});

test('stalePaths lists target leaves no longer in the source', () => {
  const target = {
    nav: { home: 'Accueil', about: 'A', legacy: 'old' },
    home: { title: 'B', cta: 'C' },
  };
  assert.deepEqual(stalePaths(source, target), ['nav.legacy']);
});

test('rebuildFromSource keeps existing, fills missing, drops stale, mirrors structure', async () => {
  const target = {
    nav: { home: 'Accueil', legacy: 'old' },
    home: { title: 'Bonjour' },
  };
  const calls = [];
  const translate = async (text, path) => {
    calls.push(path);
    return `[fr]${text}`;
  };
  const { result, filled } = await rebuildFromSource(source, target, translate);

  // Existing translations preserved.
  assert.equal(result.nav.home, 'Accueil');
  assert.equal(result.home.title, 'Bonjour');
  // Missing keys filled via translate().
  assert.equal(result.nav.about, '[fr]About');
  assert.equal(result.home.cta, '[fr]Go {name}');
  // Stale key dropped; structure mirrors source exactly.
  assert.deepEqual(Object.keys(result.nav), ['home', 'about']);
  assert.deepEqual(missingPaths(source, result), []);
  assert.deepEqual(stalePaths(source, result), []);
  // Only missing paths were translated.
  assert.deepEqual(filled.sort(), ['home.cta', 'nav.about']);
  assert.deepEqual(calls.sort(), ['home.cta', 'nav.about']);
});

test('changedPaths flags only keys whose source hash differs from baseline', () => {
  const baseline = sourceHashes(source);
  // Nothing changed yet.
  assert.deepEqual(changedPaths(source, baseline), []);
  // Edit one English string; new keys (absent from baseline) are ignored.
  const edited = {
    nav: { home: 'Home', about: 'About' },
    home: { title: 'Hi there', cta: 'Go {name}', extra: 'New' },
  };
  assert.deepEqual(changedPaths(edited, baseline), ['home.title']);
  // Empty baseline (first run) forces nothing.
  assert.deepEqual(changedPaths(source, {}), []);
});

test('hashText is stable and differs for different text', () => {
  assert.equal(hashText('Hello'), hashText('Hello'));
  assert.notEqual(hashText('Hello'), hashText('Hallo'));
});

test('globToRegExp / matchGlobs select leaves by namespace or wildcard', () => {
  assert.ok(globToRegExp('home.*').test('home.cta'));
  assert.ok(!globToRegExp('home.*').test('nav.home'));
  assert.deepEqual(matchGlobs(source, ['home.*']).sort(), [
    'home.cta',
    'home.title',
  ]);
  assert.deepEqual(matchGlobs(source, ['nav.about']), ['nav.about']);
  assert.deepEqual(matchGlobs(source, ['*']).sort(), [
    'home.cta',
    'home.title',
    'nav.about',
    'nav.home',
  ]);
  assert.deepEqual(matchGlobs(source, []), []);
});

test('rebuildFromSource re-translates forced paths even when present', async () => {
  const target = {
    nav: { home: 'Accueil', about: 'A propos' },
    home: { title: 'Bonjour', cta: 'Aller {name}' },
  };
  const translate = async (text) => `[fr]${text}`;
  const { result, filled } = await rebuildFromSource(
    source,
    target,
    translate,
    new Set(['home.title']),
  );
  // Forced path re-translated; others preserved.
  assert.equal(result.home.title, '[fr]Hello');
  assert.equal(result.nav.home, 'Accueil');
  assert.deepEqual(filled, ['home.title']);
});

test('parseArgs reads --report and --retranslate globs (both forms)', () => {
  assert.deepEqual(parseArgs(['--report']), { report: true, globs: [] });
  assert.deepEqual(parseArgs(['--retranslate', 'support.*']), {
    report: false,
    globs: ['support.*'],
  });
  assert.deepEqual(parseArgs(['--retranslate=a.*,b.*']), {
    report: false,
    globs: ['a.*', 'b.*'],
  });
  assert.deepEqual(parseArgs(['--retranslate']), { report: false, globs: [] });
});
