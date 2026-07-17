-- Optional user profile picture. Stored as a full public URL; null falls back
-- to a generated avatar in the UI.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
