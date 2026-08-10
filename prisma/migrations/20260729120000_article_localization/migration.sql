-- Article localization (blog i18n): per-locale rows grouped by translationGroupId.
--
-- Each article row now carries a `locale`; translations of the same post share a
-- `translationGroupId`. `en` is the authored source and the serving fallback.
-- Existing articles become their own single-locale (English) group.

ALTER TABLE "Article" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Article" ADD COLUMN "translationGroupId" TEXT;
ALTER TABLE "Article" ADD COLUMN "machineTranslated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Article" ADD COLUMN "translationReviewed" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: each existing article is its own translation group (English source).
UPDATE "Article" SET "translationGroupId" = "id" WHERE "translationGroupId" IS NULL;
ALTER TABLE "Article" ALTER COLUMN "translationGroupId" SET NOT NULL;

-- Slug is now unique per locale, not globally.
DROP INDEX "Article_slug_key";
CREATE UNIQUE INDEX "Article_slug_locale_key" ON "Article"("slug", "locale");
CREATE INDEX "Article_status_locale_publishedAt_idx" ON "Article"("status", "locale", "publishedAt");
CREATE INDEX "Article_translationGroupId_idx" ON "Article"("translationGroupId");
