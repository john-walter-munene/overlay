-- Supabase Auth (OB-145): Supabase owns authentication.
-- Make the legacy passwordHash optional and link the local User to the
-- Supabase identity via a unique supabaseUserId.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "supabaseUserId" TEXT;
CREATE UNIQUE INDEX "User_supabaseUserId_key" ON "User"("supabaseUserId");
