-- In-play score capture for live/in-play picks (OB-039). The timing gate uses
-- the latest known score to reject a `live` pick on a market the running game
-- has already decided (e.g. Over 2.5 once 3 goals are in, BTTS once both sides
-- have scored). `NULL` until a score is observed from the provider feed.
ALTER TABLE "Event"
  ADD COLUMN "liveHomeScore" INTEGER,
  ADD COLUMN "liveAwayScore" INTEGER;
