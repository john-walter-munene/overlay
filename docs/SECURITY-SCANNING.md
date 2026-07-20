# Security scanning (OB-086)

Dependency and container vulnerability scanning are wired into CI so that **new**
HIGH/CRITICAL issues fail the build, while already-known advisories are triaged
and tracked rather than blocking every PR.

## What runs where

| Layer | Tool | Where | Gate |
| --- | --- | --- | --- |
| npm dependencies | `npm audit` via `scripts/audit-ci.mjs` | CI `audit` job (`npm run audit:ci`) | Fails on any **untriaged** high/critical advisory |
| npm dependencies | Dependabot | `.github/dependabot.yml` (weekly + security) | Opens fix PRs |
| GitHub Actions | Dependabot | `.github/dependabot.yml` | Opens fix PRs |
| Container image | Trivy | CI `image-scan` job | Fails on **fixable** high/critical OS/library CVEs |
| Container base image | Dependabot (`docker`) | `.github/dependabot.yml` | Opens fix PRs |

## The dependency audit gate

`npm audit` has no native concept of a baseline, so `scripts/audit-ci.mjs` adds
one:

1. It runs `npm audit --json` and collects every advisory of severity `high` or
   `critical` (configurable with `AUDIT_LEVEL`).
2. Each advisory is matched against `.audit-allowlist.json` by its GitHub
   advisory **source id** (the number `npm audit` reports for each GHSA).
3. Advisories **not** in the allow-list fail the build. Advisories in the
   allow-list are suppressed but printed, so triage stays visible.

Run it locally:

```bash
npm run audit:ci
```

### Triaging an advisory

When CI reports a new high/critical advisory, prefer to **fix** it (`npm audit
fix`, or bump the offending dependency). If it can't be fixed yet and the risk
is reviewed and accepted, add an entry to `.audit-allowlist.json`:

```jsonc
"advisories": {
  "1234567": {                 // the source id from `npm audit --json`
    "name": "some-pkg",
    "severity": "high",
    "reason": "Why this is accepted / what's blocking the fix.",
    "expires": "2026-12-31"    // optional; forces re-triage once passed
  }
}
```

An entry whose `expires` date has passed stops suppressing the advisory, forcing
a fresh review instead of letting exceptions live forever.

## Current triage (baseline)

All entries in `.audit-allowlist.json` are transitive or framework advisories
that require a breaking upstream major to clear and are tracked for future
bumps (Dependabot will raise those PRs):

- **`glob`, `picomatch`, `tmp`** — build/dev tooling only; not in the production
  runtime image and never invoked with untrusted input.
- **`multer`** (via `@nestjs/platform-express`) — DoS advisories; no untrusted
  multipart upload endpoints are currently exposed. Tracked for the NestJS
  platform bump.
- **`next`** — DoS / SSRF / middleware-bypass advisories in the web app; tracked
  for the Next.js upgrade.

Re-run `npm run audit:ci` after any dependency change to confirm no new
high/critical advisories slipped in.
