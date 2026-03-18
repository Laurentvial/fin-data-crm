-- Migration: Account types for bank accounts
-- Types de comptes configurables par les administrateurs (ex. Compte courant, Épargne, Professionnel)

CREATE TABLE IF NOT EXISTS account_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_account_types_sort_order ON account_types(sort_order);

ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_type_id uuid REFERENCES account_types(id) ON DELETE SET NULL;
