-- Live / in-play picks (OB-039). A pick is either placed before kickoff
-- (`pre_match`, the default and the only CLV-bearing type) or during the game
-- (`live`, in-play). Live picks bypass the OB-038 kickoff cutoff but are
-- excluded from CLV and aggregated separately from pre-match yield.
CREATE TYPE "PickType" AS ENUM ('pre_match', 'live');

ALTER TABLE "Pick"
  ADD COLUMN "pickType" "PickType" NOT NULL DEFAULT 'pre_match';

-- Materialized live/in-play book, kept separate from the pre-match headline so
-- live and pre-match yield are never blended.
ALTER TABLE "TipsterStats"
  ADD COLUMN "liveYield" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "liveWinRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "liveSampleSize" INTEGER NOT NULL DEFAULT 0;
