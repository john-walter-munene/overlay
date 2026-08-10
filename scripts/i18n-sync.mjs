/**
 * i18n catalog sync — keep locale catalogs in parity with the English source.
 *
 * English (apps/web/messages/en.json) is the single source of truth. This tool
 * rebuilds each target locale to mirror en.json's structure: existing
 * translations are kept, keys missing from a locale are filled via a translation
 * provider, keys whose English source changed since the last sync are
 * re-translated, and stale keys (no longer in en) are dropped. This is the
 * automation behind "add or edit English keys -> every locale stays complete and
 * up to date", which the i18n parity test then enforces in CI.
 *
 * Change detection: a baseline of English source hashes is kept in
 * apps/web/messages/.i18n-source.json. When the English text behind a key
 * changes, that key is re-translated in every locale on the next sync. The
 * baseline is rewritten after each sync. (Committed so CI/other devs share it.)
 *
 * Providers (via I18N_PROVIDER env, default "copy"):
 *   - copy   : copy the English text verbatim as a placeholder. Keeps catalogs
 *              in parity so the build passes; refine later with a real provider.
 *   - deepl  : DeepL API (needs DEEPL_API_KEY). Strong for FR/ES/PT/DE.
 *   - openai : OpenAI API (needs OPENAI_API_KEY).
 *
 * ICU placeholders ({count}, {date}) and rich-text tags (<link>, <b>) are
 * preserved: the "copy" provider is verbatim, and the API prompts/params
 * instruct the engine not to translate them.
 *
 * Usage:
 *   node scripts/i18n-sync.mjs --report                 # list missing/stale/changed keys, write nothing
 *   node scripts/i18n-sync.mjs                          # fill missing + re-translate changed (provider=copy)
 *   node scripts/i18n-sync.mjs --retranslate support.*  # also force-refresh matching keys
 *   I18N_PROVIDER=deepl node scripts/i18n-sync.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = join(HERE, '..', 'apps', 'web', 'messages');
const HASHES_FILE = join(MESSAGES_DIR, '.i18n-source.json');
const SOURCE_LOCALE = 'en';
const TARGET_LOCALES = ['fr', 'es', 'pt', 'de', 'nl', 'zh', 'tr'];

// ---- pure helpers (unit-tested in i18n-sync.test.mjs) ----------------------

/** Flatten a nested message object into { "a.b.c": "value" } leaf paths. */
export function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, path));
    } else {
      out[path] = v;
    }
  }
  return out;
}

/** Read a dotted path from a nested object, or undefined if absent. */
export function getPath(obj, path) {
  return path.split('.').reduce(
    (acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined),
    obj,
  );
}

/** Leaf paths present in source but missing (undefined) in target. */
export function missingPaths(source, target) {
  return Object.keys(flatten(source)).filter(
    (p) => getPath(target, p) === undefined,
  );
}

/** Leaf paths present in target but no longer in source (stale). */
export function stalePaths(source, target) {
  return Object.keys(flatten(target)).filter(
    (p) => getPath(source, p) === undefined,
  );
}

/** Short, stable fingerprint of a source string. */
export function hashText(text) {
  return createHash('sha1').update(String(text)).digest('hex').slice(0, 12);
}

/** Build { leafPath: hash } for every leaf in the source catalog. */
export function sourceHashes(source) {
  const out = {};
  for (const [p, v] of Object.entries(flatten(source))) out[p] = hashText(v);
  return out;
}

/**
 * Leaf paths whose English source changed since the recorded baseline. Only
 * paths with a recorded hash are considered — brand-new keys are handled as
 * "missing", so a first run (empty baseline) forces nothing.
 */
export function changedPaths(source, priorHashes) {
  const now = sourceHashes(source);
  return Object.keys(now).filter(
    (p) => priorHashes[p] !== undefined && priorHashes[p] !== now[p],
  );
}

/** Convert a simple glob (only `*` is special) into an anchored RegExp. */
export function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/** Leaf paths in source matching any of the provided globs. */
export function matchGlobs(source, globs) {
  if (!globs.length) return [];
  const res = globs.map(globToRegExp);
  return Object.keys(flatten(source)).filter((p) => res.some((r) => r.test(p)));
}

/**
 * Rebuild a target catalog so it mirrors the source structure exactly: reuse the
 * existing target leaf when present, otherwise call translate(sourceText, path).
 * Paths in `forcePaths` are always (re)translated even if the target already has
 * a value — used to refresh keys whose English source changed. Guarantees key
 * parity with the source and drops stale keys. Returns the new object plus the
 * list of paths that were filled.
 */
export async function rebuildFromSource(
  source,
  target,
  translate,
  forcePaths = new Set(),
) {
  const filled = [];
  async function walk(src, tgt, prefix) {
    const out = {};
    for (const [k, v] of Object.entries(src)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = await walk(v, (tgt && tgt[k]) || {}, path);
      } else if (tgt && typeof tgt[k] === 'string' && !forcePaths.has(path)) {
        out[k] = tgt[k];
      } else {
        out[k] = await translate(v, path);
        filled.push(path);
      }
    }
    return out;
  }
  const result = await walk(source, target ?? {}, '');
  return { result, filled };
}

// ---- translation providers -------------------------------------------------

function makeProvider(name) {
  if (name === 'copy') {
    return async (text) => text;
  }
  if (name === 'deepl') {
    const key = process.env.DEEPL_API_KEY;
    if (!key) throw new Error('DEEPL_API_KEY is not set');
    const host = key.endsWith(':fx')
      ? 'https://api-free.deepl.com'
      : 'https://api.deepl.com';
      const targetOf = { fr: 'FR', es: 'ES', pt: 'PT-PT', de: 'DE', nl: 'NL', zh: 'ZH', tr: 'TR' };
    return async (text, locale) => {
      const body = new URLSearchParams({
        text,
        target_lang: targetOf[locale] ?? locale.toUpperCase(),
        tag_handling: 'xml',
        ignore_tags: 'x',
        preserve_formatting: '1',
      });
      const res = await fetch(`${host}/v2/translate`, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${key}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      if (!res.ok) throw new Error(`DeepL ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.translations?.[0]?.text ?? text;
    };
  }
  if (name === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is not set');
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const names = {
      fr: 'French',
      es: 'Spanish',
      pt: 'Portuguese',
      de: 'German',
      nl: 'Dutch',
      zh: 'Chinese (Simplified)',
      tr: 'Turkish',
    };
    return async (text, locale) => {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                'You are a professional UI localizer for a sports tipster marketplace. ' +
                'Translate the user text to ' +
                (names[locale] ?? locale) +
                '. Keep the brand name "Overlay Picks" and the term "CLV" unchanged. ' +
                'Never translate or alter ICU placeholders in curly braces (e.g. {count}, {date}) ' +
                'or XML-like tags (e.g. <link>, <b>). Return ONLY the translation, no quotes.',
            },
            { role: 'user', content: text },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() ?? text;
    };
  }
  throw new Error(`Unknown I18N_PROVIDER "${name}" (use copy|deepl|openai)`);
}

// ---- CLI -------------------------------------------------------------------

async function readCatalog(locale) {
  return JSON.parse(await readFile(join(MESSAGES_DIR, `${locale}.json`), 'utf8'));
}

/** Read the English source-hash baseline, or {} if it doesn't exist yet. */
async function readHashes() {
  try {
    return JSON.parse(await readFile(HASHES_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** Write the baseline with keys sorted for stable, review-friendly diffs. */
async function writeHashes(hashes) {
  const ordered = {};
  for (const k of Object.keys(hashes).sort()) ordered[k] = hashes[k];
  await writeFile(HASHES_FILE, JSON.stringify(ordered, null, 2) + '\n', 'utf8');
}

/** Parse CLI flags: --report and --retranslate <glob[,glob]> (repeatable). */
export function parseArgs(argv) {
  const globs = [];
  let report = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--report') {
      report = true;
    } else if (a === '--retranslate') {
      const v = argv[i + 1];
      if (v && !v.startsWith('--')) {
        globs.push(...v.split(','));
        i++;
      }
    } else if (a.startsWith('--retranslate=')) {
      globs.push(...a.slice('--retranslate='.length).split(','));
    }
  }
  return { report, globs: globs.map((g) => g.trim()).filter(Boolean) };
}

async function main() {
  const { report: reportOnly, globs } = parseArgs(process.argv.slice(2));
  const providerName = process.env.I18N_PROVIDER ?? 'copy';
  const source = await readCatalog(SOURCE_LOCALE);
  const priorHashes = await readHashes();
  const changed = changedPaths(source, priorHashes);

  if (reportOnly) {
    let clean = true;
    for (const locale of TARGET_LOCALES) {
      const target = await readCatalog(locale);
      const missing = missingPaths(source, target);
      const stale = stalePaths(source, target);
      if (missing.length || stale.length) clean = false;
      console.log(
        `${locale}: ${missing.length} missing, ${stale.length} stale`,
      );
      for (const p of missing) console.log(`  + ${p}`);
      for (const p of stale) console.log(`  - ${p}`);
    }
    if (changed.length) {
      console.log(
        `source: ${changed.length} key(s) changed since last sync ` +
          `(run \`npm run i18n:sync\` to refresh translations)`,
      );
      for (const p of changed) console.log(`  ~ ${p}`);
    }
    process.exit(clean ? 0 : 1);
  }

  const forced = matchGlobs(source, globs);
  const forcePaths = new Set([...changed, ...forced]);
  const translate = makeProvider(providerName);
  console.log(`Provider: ${providerName}`);
  if (forcePaths.size) {
    console.log(
      `Re-translating ${forcePaths.size} key(s) ` +
        `(${changed.length} changed, ${forced.length} forced)`,
    );
  }
  for (const locale of TARGET_LOCALES) {
    const target = await readCatalog(locale);
    const wrap = (text, path) => translate(text, locale, path);
    const { result, filled } = await rebuildFromSource(
      source,
      target,
      wrap,
      forcePaths,
    );
    await writeFile(
      join(MESSAGES_DIR, `${locale}.json`),
      JSON.stringify(result, null, 2) + '\n',
      'utf8',
    );
    console.log(
      `${locale}: filled ${filled.length} key(s)` +
        (providerName === 'copy' && filled.length
          ? ' (copied from English — needs real translation)'
          : ''),
    );
  }
  // Rewrite the baseline so future English edits are detected next run.
  await writeHashes(sourceHashes(source));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
