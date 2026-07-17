-- Follow (free tracking): a user follows a tipster to track public performance
-- without subscribing. Distinct from Subscription (paid, unlocks gated picks) —
-- a follow never grants access to live/pre-event selections.
-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipsterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Follow_tipsterId_idx" ON "Follow"("tipsterId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_userId_tipsterId_key" ON "Follow"("userId", "tipsterId");

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_tipsterId_fkey" FOREIGN KEY ("tipsterId") REFERENCES "Tipster"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
