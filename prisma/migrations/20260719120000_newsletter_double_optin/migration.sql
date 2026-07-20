-- Newsletter double opt-in + one-click unsubscribe (OB-157).
-- Adds a confirmation token (double opt-in), a per-subscriber unsubscribe token
-- (one-click CAN-SPAM/GDPR unsubscribe), a consent timestamp and updatedAt.

-- AlterTable: add nullable columns first so existing rows can be backfilled.
ALTER TABLE "NewsletterSubscriber"
  ADD COLUMN "confirmToken" TEXT,
  ADD COLUMN "unsubscribeToken" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Backfill existing rows: they were legacy single opt-in signups, so treat them
-- as already-confirmed consent, give them an unsubscribe token, and stamp
-- updatedAt.
UPDATE "NewsletterSubscriber"
SET
  "unsubscribeToken" = REPLACE(gen_random_uuid()::text, '-', '') || REPLACE(gen_random_uuid()::text, '-', ''),
  "updatedAt" = "createdAt",
  "confirmedAt" = CASE WHEN "status" = 'subscribed' THEN "createdAt" ELSE "confirmedAt" END;

-- Now enforce NOT NULL on the columns that must always be present.
ALTER TABLE "NewsletterSubscriber"
  ALTER COLUMN "unsubscribeToken" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

-- New signups default to pending (double opt-in) instead of subscribed.
ALTER TABLE "NewsletterSubscriber"
  ALTER COLUMN "status" SET DEFAULT 'pending';

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_confirmToken_key" ON "NewsletterSubscriber"("confirmToken");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_unsubscribeToken_key" ON "NewsletterSubscriber"("unsubscribeToken");
