-- Migration: Banks table and bank_files for logos
-- banks: catalog of banks (e.g. BNP, Société Générale)
-- bank_files: store bank logos (same pattern as company_files)
-- bank_accounts: add bank_id to link accounts to banks

CREATE TABLE IF NOT EXISTS banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
  file_type varchar(20) NOT NULL,
  filename varchar(255),
  content_type varchar(100),
  data_base64 text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  UNIQUE(bank_id, file_type)
);

CREATE INDEX IF NOT EXISTS ix_bank_files_bank_id ON bank_files(bank_id);

ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS bank_id uuid REFERENCES banks(id) ON DELETE SET NULL;
