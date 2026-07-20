-- Rising-tipster graduation gating (OB-153).
-- New tipsters are provisional ("rising"): tips are free/public and live picks
-- are ungated. Crossing the configurable graduation threshold advances them to
-- "pending_review" for admin sign-off; live picks are only gated once verified
-- AND subscription gating is explicitly enabled.
ALTER TABLE "Tipster" ADD COLUMN "graduationStatus" TEXT NOT NULL DEFAULT 'rising';
ALTER TABLE "Tipster" ADD COLUMN "subscriptionGatingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tipster" ADD COLUMN "graduationEligibleAt" TIMESTAMP(3);
