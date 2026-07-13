-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'tipster', 'admin');

-- CreateEnum
CREATE TYPE "PickStatus" AS ENUM ('pending', 'won', 'lost', 'void');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'past_due', 'canceled');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'paid', 'failed');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'user',
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tipster" (
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "sports" TEXT[],
    "subscriptionPriceCents" INTEGER NOT NULL DEFAULT 0,
    "stripeAccountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tipster_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "vendorEventId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "league" TEXT,
    "home" TEXT NOT NULL,
    "away" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "closingCapturedAt" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pick" (
    "id" TEXT NOT NULL,
    "tipsterId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "oddsAtPick" DOUBLE PRECISION NOT NULL,
    "stakeUnits" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "hash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PickStatus" NOT NULL DEFAULT 'pending',
    "closingOdds" DOUBLE PRECISION,
    "clv" DOUBLE PRECISION,
    "result" TEXT,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Pick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipsterId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "currentPeriodEnd" TIMESTAMP(3),

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipsterStats" (
    "tipsterId" TEXT NOT NULL,
    "roi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "yield" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clvAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "maxDrawdown" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipsterStats_pkey" PRIMARY KEY ("tipsterId")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "tipsterId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "stripeTransferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "coverImage" TEXT,
    "tags" TEXT[],
    "status" "ArticleStatus" NOT NULL DEFAULT 'draft',
    "readingMinutes" INTEGER NOT NULL DEFAULT 1,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "canonicalUrl" TEXT,
    "authorId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Event_vendorEventId_key" ON "Event"("vendorEventId");

-- CreateIndex
CREATE INDEX "Event_startTime_idx" ON "Event"("startTime");

-- CreateIndex
CREATE INDEX "Pick_tipsterId_status_idx" ON "Pick"("tipsterId", "status");

-- CreateIndex
CREATE INDEX "Pick_eventId_status_idx" ON "Pick"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_tipsterId_key" ON "Subscription"("userId", "tipsterId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_status_publishedAt_idx" ON "Article"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Article_tags_idx" ON "Article"("tags");

-- AddForeignKey
ALTER TABLE "Tipster" ADD CONSTRAINT "Tipster_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pick" ADD CONSTRAINT "Pick_tipsterId_fkey" FOREIGN KEY ("tipsterId") REFERENCES "Tipster"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pick" ADD CONSTRAINT "Pick_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tipsterId_fkey" FOREIGN KEY ("tipsterId") REFERENCES "Tipster"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipsterStats" ADD CONSTRAINT "TipsterStats_tipsterId_fkey" FOREIGN KEY ("tipsterId") REFERENCES "Tipster"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_tipsterId_fkey" FOREIGN KEY ("tipsterId") REFERENCES "Tipster"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
