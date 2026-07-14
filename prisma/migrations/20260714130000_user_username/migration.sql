-- Account settings (OB-006): user-chosen public handle, unique.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
