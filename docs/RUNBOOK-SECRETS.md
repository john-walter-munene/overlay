# Runbook — Secrets management & rotation (OB-082)

This runbook covers the application's sensitive configuration: what each secret
protects, how the boot guard enforces strong values, and how to rotate them
safely — **especially the pick-hash pepper**, which is not a drop-in rotation.

## Inventory

| Env var | Purpose | Rotation risk |
| --- | --- | --- |
| `JWT_SECRET` | Reserved signing secret for first-party tokens. | Low — stateless; rotating invalidates any tokens signed with it. |
| `PICK_HASH_PEPPER` | Server-side pepper mixed into every pick's tamper-evident hash (`SHA256(canonical(payload) + nonce + pepper)`). | **High** — see [Rotating `PICK_HASH_PEPPER`](#rotating-pick_hash_pepper). |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payment provider credentials (required when `PAYMENTS_PROVIDER=stripe`). | Provider-managed; rotate in the Stripe dashboard, then update env. |
| `SUPABASE_SERVICE_ROLE_KEY`, VAPID keys, etc. | Third-party credentials. | Rotate at the provider, then update env. |

> Application auth verifies **Supabase-issued** JWTs via the project's public
> JWKS (`apps/api/src/common/supabase.ts`), so there is no shared HS256 secret
> to rotate for end-user sessions. Rotate Supabase keys from the Supabase
> dashboard.

## Boot guard

`validateEnv()` (`apps/api/src/common/config.ts`) runs once at startup, before
the Nest app is created (`apps/api/src/main.ts`). It refuses to boot in
production when any strong-secret var is:

- **missing**,
- set to a **known default/example** value (e.g. `change-me`, `dev-pepper` — see
  `INSECURE_DEFAULTS`), or
- **too weak** (shorter than `MIN_SECRET_LENGTH` = 32 characters).

In production (`NODE_ENV=production`) these abort startup with
`Refusing to start with an insecure configuration`. Outside production the same
problems are logged as warnings so local dev still runs with zero config.

## Generating a strong secret

Any of these produce a value that satisfies the guard:

```sh
openssl rand -hex 32      # 64 hex chars
openssl rand -base64 32   # 44 base64 chars
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Store the value in your secret manager / hosting env (Render, etc.) — never
commit it. `.env.example` ships placeholders on purpose; they are rejected by
the boot guard so they can't be shipped to production by accident.

## Rotating `JWT_SECRET`

1. Generate a new value (above) and set `JWT_SECRET` in the environment.
2. Redeploy. Any tokens signed with the old secret stop validating; issue new
   ones on next login.

## Rotating `PICK_HASH_PEPPER`

The pepper is baked into the historical hash of **every pick that has ever been
locked**. Picks are append-only integrity records (see
`docs/ARCHITECTURE.md` §4), and verification recomputes
`hashPick(payload, nonce, pepper)`. **Changing the pepper makes existing stored
hashes fail to re-verify against the new pepper** — you cannot silently swap it.

Choose one of the following, in order of preference:

1. **Don't rotate unless compromised.** The pepper only ever lives server-side;
   treat it like the crown jewels and avoid rotation without cause.

2. **Rotate on suspected compromise (accepting historical re-verification
   loss).** Set a new strong `PICK_HASH_PEPPER` and redeploy. New picks are
   protected by the new pepper. Historical picks remain in the database with
   their original hashes, but those hashes can no longer be recomputed once the
   old pepper is destroyed. Record the rotation date so audits know which cohort
   was hashed under which pepper.

3. **Rotate with continuity (recommended if you must keep verifying old
   picks).** Keep the previous pepper available for *verification only*:
   - Provision the new pepper as `PICK_HASH_PEPPER` (used for **new** hashes).
   - Retain the previous value (e.g. `PICK_HASH_PEPPER_PREVIOUS`) in the secret
     manager and extend verification to try current-then-previous peppers.
   - Once every pick predating the rotation is `SETTLED` and past your audit
     retention window, drop the previous pepper.

   > Note: the codebase currently hashes and verifies with a single pepper
   > (`PicksService.pepper`). Option 3 requires a small code change to accept a
   > list of peppers on the verify path before it can be used — track that as
   > follow-up work when continuity is required.

## Checklist

- [ ] New secret generated with ≥32 chars of real entropy (`openssl rand`).
- [ ] Value stored only in the secret manager / hosting env, never committed.
- [ ] `.env.example` still contains **placeholders only**.
- [ ] For pepper rotations: continuity strategy chosen and rotation date logged.
- [ ] Deployed to a canary/staging env first; boot guard passed (no
      `Refusing to start` error in logs).
