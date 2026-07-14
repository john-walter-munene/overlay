# Overlay Bets — Privacy, Data Retention & PII Audit (v1)

> **Status:** Draft v1
> **Scope:** GDPR data-subject requests (export/erasure), retention policy, and
> PII minimization for the MVP (OB-085).
> **Companion docs:** `ARCHITECTURE.md` (data model & integrity), `SPEC.md` (product).

---

## 1. Principles

- **Data minimization.** We store the minimum PII needed to operate the
  marketplace. Authentication is delegated to Supabase (OB-145); we do not store
  passwords for new accounts (`User.passwordHash` is legacy/optional).
- **Integrity is preserved through erasure.** The `picks` table is
  **append-only** and is the platform's integrity moat (see `ARCHITECTURE.md`
  §1/§4). Erasure therefore **anonymizes** a data subject's PII in place rather
  than hard-deleting rows, so locked picks — and their hash/nonce/timestamp
  integrity fields — are never mutated.
- **Accountability.** Every erasure is recorded in the append-only `AuditLog`
  (`action = user.erased`).

## 2. PII audit — what we store and where

| Model | Field | Classification | Notes |
|---|---|---|---|
| `User` | `email` | Direct PII | Login/contact identifier. Anonymized on erasure. |
| `User` | `passwordHash` | Credential (legacy) | Null for Supabase accounts. Cleared on erasure. |
| `User` | `supabaseUserId` | Pseudonymous identifier | Links to the identity provider. Cleared on erasure. |
| `User` | `role`, `createdAt` | Non-PII | Retained. |
| `Tipster` | `bio` | User-supplied free text (may contain PII) | Cleared on erasure. |
| `Tipster` | `stripeAccountId` | Financial identifier | Cleared on erasure. |
| `Tipster` | `sports`, `subscriptionPriceCents`, `status`, stats | Non-PII | Retained. |
| `Pick` | all fields | Non-PII (references `tipsterId`) | **Append-only; never mutated by erasure.** |
| `Subscription` | `stripeSubscriptionId` | Pseudonymous financial token | Retained for financial/tax obligations. |
| `Payout` | `stripeTransferId`, `amountCents` | Financial record | Retained for financial/tax obligations. |
| `Article` | `body`, `authorId` | Public content | Retained; authorship de-identified once the `User` is anonymized. |
| `AuditLog` | `actor`, `payload` | Operational record | Append-only; retained for accountability/security. |

## 3. Data-subject request flows

Both endpoints are self-service and act only on the **authenticated caller**.

### 3.1 Right of access / portability — `GET /privacy/export`

Returns a machine-readable JSON bundle of all data tied to the requesting user:
account, tipster profile (if any), their picks, subscriptions, and authored
articles. Implemented by `PrivacyService.exportUser` via the pure
`buildUserExport` shaper (`apps/api/src/modules/privacy/privacy.ts`).

### 3.2 Right to erasure — `DELETE /privacy/me`

Anonymizes the caller's PII in a single transaction:

- `User`: `email` → deterministic placeholder `deleted-<id>@deleted.overlay`,
  `passwordHash` → null, `supabaseUserId` → null.
- `Tipster` (if present): `bio` → null, `stripeAccountId` → null,
  `status` → `suspended` (removes the anonymized profile from public discovery).
- Writes an `AuditLog` entry (`user.erased`).

**Append-only picks are intentionally excluded** — no pick field (including
`tipsterId`, `hash`, `nonce`, `lockedAt`) is written, so historical performance
and the tamper-evident integrity chain remain verifiable. This property is
covered by unit tests in `privacy.test.ts`.

## 4. Retention policy

| Data | Retention |
|---|---|
| Account PII (`email`, `supabaseUserId`) | Until account erasure request, then anonymized. |
| Tipster PII (`bio`, `stripeAccountId`) | Until account erasure request, then cleared. |
| Picks (append-only) | Retained indefinitely as pseudonymous performance records; the integrity moat depends on immutability. |
| Financial records (subscriptions, payouts) | Retained per financial/tax obligations even after erasure; they carry no direct PII beyond pseudonymous provider tokens. |
| Audit log | Retained for accountability and security investigations. |
