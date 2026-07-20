/**
 * Dependency vulnerability gate for CI (OB-086).
 *
 * Runs `npm audit --json` and fails the build when a HIGH or CRITICAL advisory
 * is present that has NOT been explicitly triaged. Triaged advisories live in
 * `.audit-allowlist.json` (keyed by GitHub advisory / GHSA source id) so that:
 *
 *   - CI fails on any *new* high/critical advisory, but
 *   - already-triaged advisories don't block the build until they can be fixed.
 *
 * Each allow-list entry may carry an optional `expires` date (YYYY-MM-DD). Once
 * that date has passed the entry stops suppressing the advisory, forcing a
 * fresh triage rather than letting an exception live forever.
 *
 * Usage:
 *   node scripts/audit-ci.mjs                 # gate on high + critical
 *   AUDIT_LEVEL=critical node scripts/audit-ci.mjs
 *
 * Exit codes: 0 = clean/all triaged, 1 = untriaged advisories found,
 * 2 = failed to run/parse `npm audit`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const allowlistPath = resolve(repoRoot, '.audit-allowlist.json');

// Severities that fail the build (ordered from least to most severe).
const SEVERITY_ORDER = ['low', 'moderate', 'high', 'critical'];
const gateLevel = (process.env.AUDIT_LEVEL ?? 'high').toLowerCase();
const gateIndex = SEVERITY_ORDER.indexOf(gateLevel);
if (gateIndex === -1) {
  console.error(`audit-ci: unknown AUDIT_LEVEL "${gateLevel}"`);
  process.exit(2);
}
const gatedSeverities = new Set(SEVERITY_ORDER.slice(gateIndex));

function loadAllowlist() {
  let raw;
  try {
    raw = readFileSync(allowlistPath, 'utf8');
  } catch {
    // No allow-list file => nothing is triaged.
    return {};
  }
  const parsed = JSON.parse(raw);
  return parsed.advisories ?? {};
}

function runAudit() {
  const res = spawnSync(
    'npm',
    ['audit', '--json', '--audit-level', 'none'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  // `npm audit` exits non-zero when advisories exist; that's expected. We only
  // bail if it produced no parseable JSON at all (e.g. network/registry error).
  if (!res.stdout) {
    console.error('audit-ci: `npm audit` produced no output');
    if (res.stderr) console.error(res.stderr);
    process.exit(2);
  }
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error('audit-ci: failed to parse `npm audit --json` output');
    if (res.stderr) console.error(res.stderr);
    process.exit(2);
  }
}

function collectAdvisories(auditJson) {
  // npm v7+ audit schema: { vulnerabilities: { <pkg>: { via: [...] } } }.
  // Advisory objects appear as `via` entries with a `source` id; string `via`
  // entries are just links to other vulnerable packages in the same chain.
  const bySource = new Map();
  const vulns = auditJson.vulnerabilities ?? {};
  for (const pkg of Object.values(vulns)) {
    for (const via of pkg.via ?? []) {
      if (via && typeof via === 'object' && via.source != null) {
        bySource.set(String(via.source), {
          source: String(via.source),
          name: via.name,
          severity: (via.severity ?? '').toLowerCase(),
          title: via.title,
          url: via.url,
        });
      }
    }
  }
  return [...bySource.values()];
}

function isExpired(entry, now) {
  if (!entry || !entry.expires) return false;
  const when = Date.parse(entry.expires);
  return Number.isFinite(when) && when < now;
}

/**
 * Pure triage classifier — split gated advisories into triaged/untriaged/expired
 * given an allow-list. Exported so it can be unit-tested without running
 * `npm audit`.
 */
export function triage(advisories, allowlist, gatedSeverities, now = Date.now()) {
  const untriaged = [];
  const triaged = [];
  const expired = [];
  for (const adv of advisories) {
    if (!gatedSeverities.has(adv.severity)) continue;
    const entry = allowlist[adv.source];
    if (!entry) {
      untriaged.push(adv);
    } else if (isExpired(entry, now)) {
      expired.push({ adv, entry });
    } else {
      triaged.push({ adv, entry });
    }
  }
  return { untriaged, triaged, expired };
}

export { collectAdvisories, isExpired };

function main() {
  const allowlist = loadAllowlist();
  const advisories = collectAdvisories(runAudit());
  const { untriaged, triaged, expired } = triage(
    advisories,
    allowlist,
    gatedSeverities,
  );

  if (triaged.length > 0) {
    console.log(
      `audit-ci: ${triaged.length} triaged ${gateLevel}+ advisory(ies) suppressed:`,
    );
    for (const { adv, entry } of triaged) {
      console.log(
        `  - [triaged] ${adv.severity} ${adv.name} (${adv.url ?? adv.source}) — ${entry.reason ?? 'no reason given'}`,
      );
    }
  }

  const failures = [...untriaged, ...expired.map((e) => e.adv)];
  if (failures.length === 0) {
    console.log(
      `audit-ci: OK — no untriaged ${gateLevel}-or-higher advisories.`,
    );
    process.exit(0);
  }

  console.error(
    `\naudit-ci: FAILED — ${failures.length} untriaged ${gateLevel}-or-higher advisory(ies):`,
  );
  for (const adv of untriaged) {
    console.error(
      `  - [NEW] ${adv.severity} ${adv.name} (${adv.url ?? adv.source})`,
    );
    console.error(`          ${adv.title ?? ''}`);
  }
  for (const { adv, entry } of expired) {
    console.error(
      `  - [EXPIRED ${entry.expires}] ${adv.severity} ${adv.name} (${adv.url ?? adv.source}) — needs re-triage`,
    );
  }
  console.error(
    '\nFix the advisory (preferred) or, if it is a reviewed & accepted risk, add its',
  );
  console.error(
    'source id to .audit-allowlist.json with a reason. See docs/SECURITY-SCANNING.md.',
  );
  process.exit(1);
}

// Only run the gate when executed directly (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
