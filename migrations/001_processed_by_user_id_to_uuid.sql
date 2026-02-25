-- Migration: Change transactions.processed_by_user_id from bigint to uuid
-- to align with neon_auth.user.id (UUID)
-- Run this after enabling Neon Auth and creating the neon_auth schema

-- Step 1: Drop the column (existing bigint values cannot be mapped to neon_auth UUIDs)
ALTER TABLE transactions DROP COLUMN IF EXISTS processed_by_user_id;

-- Step 2: Add the column as uuid
ALTER TABLE transactions ADD COLUMN processed_by_user_id uuid NULL;

-- Optional: Add comment for documentation
COMMENT ON COLUMN transactions.processed_by_user_id IS 'References neon_auth.user.id';
