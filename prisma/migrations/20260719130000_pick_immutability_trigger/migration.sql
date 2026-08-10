-- OB-035 — DB-level pick immutability (append-only enforcement).
--
-- ARCHITECTURE.md §4/§8 mandate DB-enforced immutability for `Pick`; until now
-- it was only guarded at the application layer. This adds a BEFORE UPDATE trigger
-- that makes the picks table append-only at the database level:
--
--   1. Core wager + integrity fields (tipsterId, eventId, market, selection,
--      oddsAtPick, stakeUnits, pickType, note, hash, nonce, lockedAt) are set at
--      lock time and can NEVER be modified. Any UPDATE that changes one of them
--      is rejected — even a direct SQL UPDATE that bypasses the app.
--
--   2. Settlement fields (status, closingOdds, clv, result, settledAt) may only
--      move the pick forward through its lifecycle:
--        - while pending: the closing line can be captured, and the pick can
--          transition pending -> terminal; result/settledAt/clv must not be
--          populated without such a transition.
--        - once terminal (won/lost/void/half_won/half_lost): status, result,
--          settledAt and closingOdds are frozen. Only clv may still be filled
--          in, and only once (post-settlement CLV computation).
--
-- A settled pick can therefore never be re-graded, un-settled, or back-dated at
-- the DB layer, and its wager can never be altered after lock.

CREATE OR REPLACE FUNCTION "pick_enforce_immutability"()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. Core wager + integrity fields are immutable after lock.
  IF  NEW."tipsterId"  IS DISTINCT FROM OLD."tipsterId"
   OR NEW."eventId"    IS DISTINCT FROM OLD."eventId"
   OR NEW."market"     IS DISTINCT FROM OLD."market"
   OR NEW."selection"  IS DISTINCT FROM OLD."selection"
   OR NEW."oddsAtPick" IS DISTINCT FROM OLD."oddsAtPick"
   OR NEW."stakeUnits" IS DISTINCT FROM OLD."stakeUnits"
   OR NEW."pickType"   IS DISTINCT FROM OLD."pickType"
   OR NEW."note"       IS DISTINCT FROM OLD."note"
   OR NEW."hash"       IS DISTINCT FROM OLD."hash"
   OR NEW."nonce"      IS DISTINCT FROM OLD."nonce"
   OR NEW."lockedAt"   IS DISTINCT FROM OLD."lockedAt"
  THEN
    RAISE EXCEPTION
      'Pick % is append-only: core fields (market/selection/odds/hash/nonce/lockedAt) cannot be modified after lock', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."status" <> 'pending' THEN
    -- 2a. Already settled: the lifecycle is frozen. Only a one-time CLV fill-in
    --     is permitted; everything else must stay exactly as it was.
    IF  NEW."status"      IS DISTINCT FROM OLD."status"
     OR NEW."result"      IS DISTINCT FROM OLD."result"
     OR NEW."settledAt"   IS DISTINCT FROM OLD."settledAt"
     OR NEW."closingOdds" IS DISTINCT FROM OLD."closingOdds"
    THEN
      RAISE EXCEPTION
        'Pick % is already settled (%): settlement fields are immutable once terminal', OLD."id", OLD."status"
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD."clv" IS NOT NULL AND NEW."clv" IS DISTINCT FROM OLD."clv" THEN
      RAISE EXCEPTION
        'Pick % already has a CLV: it can only be written once', OLD."id"
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW."status" = 'pending' THEN
    -- 2b. Still pending (no terminal transition): only the closing line may be
    --     captured. Grading outputs require a pending -> terminal transition.
    IF  NEW."result"    IS NOT NULL
     OR NEW."settledAt" IS NOT NULL
     OR NEW."clv"       IS NOT NULL
    THEN
      RAISE EXCEPTION
        'Pick % settlement fields (result/settledAt/clv) require a pending -> terminal transition', OLD."id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- else: pending -> terminal transition (the sanctioned settlement write).

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "pick_immutability" ON "Pick";

CREATE TRIGGER "pick_immutability"
  BEFORE UPDATE ON "Pick"
  FOR EACH ROW
  EXECUTE FUNCTION "pick_enforce_immutability"();
