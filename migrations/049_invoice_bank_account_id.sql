-- Migration: persist selected bank account on invoices

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_invoices_bank_account_id ON invoices(bank_account_id);
