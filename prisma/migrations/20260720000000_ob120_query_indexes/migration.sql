-- OB-120 — Indexing & query performance review.
-- Add the missing composite indexes backing the hot leaderboard, profile, feed
-- and settlement queries so they no longer sort in memory or sequentially scan
-- the large Pick/Event tables.

-- Settlement: the closing-odds capture scans events at/after kickoff that have
-- not been captured yet (closingCapturedAt IS NULL). Leading with
-- closingCapturedAt seeks the small uncaptured set instead of scanning every
-- past event.
-- CreateIndex
CREATE INDEX "Event_closingCapturedAt_startTime_idx" ON "Event"("closingCapturedAt", "startTime");

-- Profile track record + subscriber feed list a tipster's picks newest first
-- (ORDER BY lockedAt DESC). This composite returns rows in lockedAt order per
-- tipster without a separate sort step.
-- CreateIndex
CREATE INDEX "Pick_tipsterId_lockedAt_idx" ON "Pick"("tipsterId", "lockedAt");

-- Leaderboard ranks by yield then CLV (ORDER BY yield DESC, clvAvg DESC). This
-- composite serves the top-N ranking via an ordered index scan instead of
-- sorting the whole stats table.
-- CreateIndex
CREATE INDEX "TipsterStats_yield_clvAvg_idx" ON "TipsterStats"("yield", "clvAvg");
