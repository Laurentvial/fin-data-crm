-- Migration: Add emoji to account_types and account_statuses for auto-generated account names
ALTER TABLE account_types ADD COLUMN IF NOT EXISTS emoji varchar(20) NULL;
ALTER TABLE account_statuses ADD COLUMN IF NOT EXISTS emoji varchar(20) NULL;
