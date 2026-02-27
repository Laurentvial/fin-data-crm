-- Migration: Add optional BIC column to bank_account_ibans
ALTER TABLE bank_account_ibans ADD COLUMN IF NOT EXISTS bic varchar(11);
