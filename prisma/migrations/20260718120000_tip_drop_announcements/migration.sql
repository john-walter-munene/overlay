-- Tip-drop schedule announcements (OB-034): a tipster-authored, pick-free
-- heads-up telling subscribers *when* tips will drop. One-off or recurring,
-- always with an explicit IANA timezone. Publishing fans out to active
-- subscribers honouring notification preferences; `announcedAt` /
-- `reminderSentAt` make the fan-outs idempotent.

-- CreateEnum
CREATE TYPE "AnnouncementRecurrence" AS ENUM ('one_off', 'daily', 'weekly');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('active', 'canceled');

-- CreateTable
CREATE TABLE "TipDropAnnouncement" (
    "id" TEXT NOT NULL,
    "tipsterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "timezone" TEXT NOT NULL,
    "recurrence" "AnnouncementRecurrence" NOT NULL DEFAULT 'one_off',
    "timeOfDay" TEXT NOT NULL,
    "dropDate" DATE,
    "weekday" INTEGER,
    "reminderMinutes" INTEGER,
    "nextDropAt" TIMESTAMP(3),
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'active',
    "announcedAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipDropAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TipDropAnnouncement_tipsterId_status_idx" ON "TipDropAnnouncement"("tipsterId", "status");

-- CreateIndex
CREATE INDEX "TipDropAnnouncement_status_nextDropAt_idx" ON "TipDropAnnouncement"("status", "nextDropAt");

-- AddForeignKey
ALTER TABLE "TipDropAnnouncement" ADD CONSTRAINT "TipDropAnnouncement_tipsterId_fkey" FOREIGN KEY ("tipsterId") REFERENCES "Tipster"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
