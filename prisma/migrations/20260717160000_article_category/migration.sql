-- Split Blog into Content (guides) and News. Existing articles default to
-- `content`; new timely posts can be marked `news`.
-- CreateEnum
CREATE TYPE "ArticleCategory" AS ENUM ('content', 'news');

-- AlterTable
ALTER TABLE "Article" ADD COLUMN "category" "ArticleCategory" NOT NULL DEFAULT 'content';

-- CreateIndex
CREATE INDEX "Article_category_status_publishedAt_idx" ON "Article"("category", "status", "publishedAt");
