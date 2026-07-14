-- Tipster onboarding wizard (OB-020): persist Stripe Connect onboarding and
-- identity verification progress so publishing can be gated until the guided
-- setup is complete.
ALTER TABLE "Tipster" ADD COLUMN "stripeOnboarded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tipster" ADD COLUMN "identityVerified" BOOLEAN NOT NULL DEFAULT false;
