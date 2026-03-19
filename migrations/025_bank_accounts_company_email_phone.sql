-- Migration: Add company_email_id and company_phone_id to bank_accounts
-- Links each bank account to a specific company email and phone

ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS company_email_id uuid REFERENCES company_emails(id) ON DELETE SET NULL;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS company_phone_id uuid REFERENCES company_phones(id) ON DELETE SET NULL;
