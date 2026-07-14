-- Multi-provider payouts (OB-06x): let tipsters be paid out on the rail of
-- their choice — Stripe (existing stripeAccountId), a crypto wallet, or a
-- mobile-money number — rather than assuming Stripe Connect.
ALTER TABLE "Tipster"
  ADD COLUMN "payoutMethod" TEXT,
  ADD COLUMN "payoutWalletAddress" TEXT,
  ADD COLUMN "payoutWalletChain" TEXT,
  ADD COLUMN "payoutMobileNumber" TEXT,
  ADD COLUMN "payoutMobileNetwork" TEXT;
