-- Multi-provider payments groundwork (OB-06x): record which payment provider
-- settles each subscription so cards (Stripe + Apple/Google Pay), crypto
-- stablecoins and mobile money can coexist rather than assuming Stripe.
ALTER TABLE "Subscription" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'stripe';
