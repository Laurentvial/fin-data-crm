-- Migration: Add extra fields to bank accounts
-- Identifiants: login, password, pin_code
-- Plafond/limite: short text
-- Cartes bleues: bank_account_cards (numero, date_expiration, cvv) - multiple per account
-- RIB: bank_account_files for document storage

ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS login varchar(255);
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS password varchar(500);
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS pin_code varchar(20);
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS plafond_limit varchar(100);

CREATE TABLE IF NOT EXISTS bank_account_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  numero varchar(19) NOT NULL,
  date_expiration varchar(7),
  cvv varchar(4),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_account_cards_bank_account_id ON bank_account_cards(bank_account_id);

CREATE TABLE IF NOT EXISTS bank_account_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  file_type varchar(20) NOT NULL,
  filename varchar(255),
  content_type varchar(100),
  data_base64 text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  UNIQUE(bank_account_id, file_type)
);

CREATE INDEX IF NOT EXISTS ix_bank_account_files_bank_account_id ON bank_account_files(bank_account_id);
