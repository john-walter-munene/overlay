-- Tipster feedback: reports can now be positive (praise) or negative (complaint).
-- AlterTable
ALTER TABLE "TipsterReport" ADD COLUMN "sentiment" TEXT NOT NULL DEFAULT 'negative';
