-- Add the `staff` role (least-privilege user/tipster administration without
-- finance access). Placed before `admin` in the enum ordering. `ADD VALUE`
-- cannot run inside a transaction block, so this migration must not be wrapped.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'staff' BEFORE 'admin';
