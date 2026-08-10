-- Paystack bank payout destination (OB-06x): store a tipster's local bank
-- account so the Paystack Transfers API can create a transfer recipient and pay
-- them out. Nullable — only tipsters who choose `payoutMethod = 'paystack'`
-- populate these.
ALTER TABLE "Tipster" ADD COLUMN "payoutBankAccount" TEXT;
ALTER TABLE "Tipster" ADD COLUMN "payoutBankCode" TEXT;
ALTER TABLE "Tipster" ADD COLUMN "payoutAccountName" TEXT;
