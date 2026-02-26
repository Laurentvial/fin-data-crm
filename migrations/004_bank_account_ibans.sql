-- Migration: Add bank_account_ibans table for multiple IBANs per bank account
CREATE TABLE IF NOT EXISTS bank_account_ibans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  iban varchar(34) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bank_account_id, iban)
);

CREATE INDEX IF NOT EXISTS idx_bank_account_ibans_bank_account_id ON bank_account_ibans(bank_account_id);
