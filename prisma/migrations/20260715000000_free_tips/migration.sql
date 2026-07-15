-- Free "Daily Tips" hub (OB-150): admin-curated, ungated house tips per day.
-- CreateTable
CREATE TABLE "FreeTip" (
    "id" TEXT NOT NULL,
    "tipDate" DATE NOT NULL,
    "sport" TEXT NOT NULL,
    "league" TEXT,
    "match" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "odds" DOUBLE PRECISION,
    "analysis" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreeTip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FreeTip_tipDate_idx" ON "FreeTip"("tipDate");
