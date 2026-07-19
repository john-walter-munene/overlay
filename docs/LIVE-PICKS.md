# Overlay Bets — Live / in‑play picks (OB‑039)

**Status:** design spike, then built · **Depends on:** OB‑038 (late‑pick & cutoff hardening)

This note documents the model for picks placed **during** an ongoing game
(in‑play / "live"), why they are modelled as a distinct type, and exactly how
their integrity, CLV and stats are treated so live and pre‑match performance are
never blended into one misleading number.

> **Terminology.** In this codebase "live picks" historically meant a
> subscriber's real‑time view of a tipster's still‑pending, *pre‑event* picks
> (see the gated `LivePicks` panel). OB‑039 introduces a different concept: a
> pick whose wager is placed **after kickoff, while the game is in play**. To
> avoid confusion the new concept is labelled **in‑play** in the UI and carried
> as `pickType = 'live'` in the data model. "Pre‑match" is `pickType =
> 'pre_match'` (the default, and everything that existed before OB‑039).

---

## 1. Why a distinct type (the conflict with OB‑038)

The pre‑match integrity model deliberately rejects anything after `startTime`:

- `createLockedPick` throws once `event.startTime <= now()` (the OB‑038 cutoff).
- **CLV** is defined against the **pre‑match closing line** — the price the
  market settled on at kickoff. For a selection made *after* kickoff that line
  does not exist, so CLV is undefined.

Rather than weaken the OB‑038 cutoff (which is the moat for pre‑match picks), we
model in‑play picks as a first‑class, separate type. The cutoff stays strict for
`pre_match`; `live` picks follow their own, equally strict, integrity rules.

## 2. Data model

`Pick` carries a `pickType` discriminator:

```
enum PickType { pre_match  live }
Pick.pickType PickType @default(pre_match)
```

- Existing picks and every normal submission are `pre_match` — 100% backwards
  compatible.
- `pickType` is set once at submission and is **immutable** thereafter (it lives
  in the append‑only `picks` table alongside `hash`/`nonce`/`lockedAt`; only the
  settlement worker ever writes settlement fields).

## 3. Integrity guarantee for live picks

A live pick keeps the same tamper‑evident guarantee as a pre‑match pick, minus
the kickoff cutoff:

- **Hash.** `hash = SHA256(canonical(payload) + nonce + pepper)` over the same
  canonical wager fields (`tipsterId, eventId, market, selection, oddsAtPick,
  stakeUnits`). The hash payload is intentionally **unchanged** so every
  historical pre‑match hash still verifies; `pickType` is recorded and audited
  next to the hash rather than folded into it.
- **Authoritative server timestamp.** `lockedAt` comes from the trusted server
  clock at submission — this is the only time signal that matters for an in‑play
  wager, since there is no pre‑match line to anchor to.
- **Append‑only.** Core fields (including `pickType`) are never mutated after
  lock; a `pick.locked` audit entry is written at submission.
- **Graded on the final result.** Live picks are settled by the same worker on
  the event's final result — no special grading path.

### Timing gate

| `pickType`  | Before kickoff | After kickoff (in play) | After the event finished |
| ----------- | -------------- | ----------------------- | ------------------------ |
| `pre_match` | ✅ accepted     | ❌ rejected (OB‑038)     | ❌ rejected               |
| `live`      | ✅ accepted     | ✅ accepted              | ❌ rejected               |

Live picks bypass the kickoff cutoff but are still rejected once the event is
`finished` — you cannot place an in‑play wager on a game that is already over.
The gate is a pure function (`picks/cutoff.ts`) so it is unit‑tested directly.

#### Already‑decided markets

A live pick must be on an outcome that is still genuinely open. Because goals
only ever accumulate, some markets become a foregone conclusion mid‑game — you
cannot bet **Over 2.5** once three goals are in, **BTTS** once both sides have
scored, or a **correct score** the game has already run past. Placing a pick on
such a market is a settled bet, not a wager, so the gate rejects it (in either
direction — an already‑won outcome is refused just like an already‑lost one).

- The rule is a pure, unit‑tested function, `isMarketDecidedInPlay(market,
  selection, homeScore, awayScore)` (shared `grading.ts`). It returns `true`
  only when the final outcome is fixed regardless of the rest of the game:
  monotonic goal markets (`totals`, `team_totals`), `btts` once both teams have
  scored, and `correct_score` once the game has passed the target.
- Winner‑based markets (`1X2`, `moneyline`, `dnb`, `double_chance`, `spreads`)
  and parity (`odd_even`) can always still flip while the game is live, so they
  are never treated as decided in‑play.
- The gate reads the latest in‑play score from the `Event`
  (`liveHomeScore`/`liveAwayScore`), refreshed each settlement cycle from the
  provider score feed (`SettlementService.refreshLiveScores`). When no score is
  known yet the check is skipped and the pick is allowed on timing alone.

Half‑time / period markets (e.g. "no goals in the first half") are not currently
gradeable — they are absent from `SUPPORTED_MARKETS` — so they are out of scope
for this check until those markets are added.

## 4. CLV & stats treatment (never blended)

- **CLV is excluded for live picks.** `pickClv` returns `null` for any pick with
  `pickType = 'live'`, so live picks never contribute to `clvAvg`. The
  settlement worker also skips closing‑odds capture / CLV for live picks. (A
  future refinement may attach an *in‑play line reference* instead; for v1 live
  picks simply carry no CLV.)
- **Yields are kept separate.** `computeSegmentedStats` splits a book into
  `preMatch` and `live` sub‑books and computes each independently. The
  materialized `TipsterStats` headline (`roi`/`yield`/`clvAvg`/`winRate`/…),
  the public leaderboard, and the tipster performance dashboard are computed
  over **pre‑match picks only**, so the CLV‑ranked yield can never be diluted by
  in‑play results. Live ROI/yield/win‑rate/sample‑size are materialized in the
  separate `live*` columns of `TipsterStats`.
- **Surfaced distinctly.** Pick lists (public track record, subscriber feed,
  "my tips") carry `pickType` and render an **in‑play indicator** so a reader can
  always tell a live pick from a pre‑match one. Live and pre‑match yield are
  shown as separate figures, never summed.

## 5. Acceptance mapping

| Acceptance criterion | Where |
| -------------------- | ----- |
| Design note reviewed before build | this file |
| `Pick.pickType`; live accepted after kickoff, pre‑match honours cutoff | `prisma/schema.prisma`, `picks/cutoff.ts`, `picks.service.ts` |
| Live hashed + server‑timestamped, append‑only, excluded from CLV, aggregated distinctly | `picks.service.ts`, `stats.ts` (`pickClv`, `computeSegmentedStats`), `settlement.service.ts`, `stats.service.ts` |
| Track record & tipster stats don't blend live and pre‑match yield | `stats.service.ts` (pre‑match headline + `live*` columns), web UI indicator |
