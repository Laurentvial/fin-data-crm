-- Migration: Account statuses for bank accounts (configurable like account types)
-- Statuts de comptes configurables par les administrateurs (ex. Ouvert, Fermé, Problème)

CREATE TABLE IF NOT EXISTS account_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_account_statuses_sort_order ON account_statuses(sort_order);

-- Insert default statuses matching existing varchar values
INSERT INTO account_statuses (name, sort_order) VALUES
  ('Ouvert', 0),
  ('Fermé', 1),
  ('Problème', 2)
ON CONFLICT DO NOTHING;

-- Add account_status_id to bank_accounts
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_status_id uuid REFERENCES account_statuses(id) ON DELETE RESTRICT;

-- Migrate existing account_status varchar to account_status_id
UPDATE bank_accounts ba
SET account_status_id = COALESCE(
  (SELECT id FROM account_statuses WHERE name = ba.account_status LIMIT 1),
  (SELECT id FROM account_statuses WHERE name = 'Ouvert' LIMIT 1)
)
WHERE ba.account_status_id IS NULL AND ba.account_status IS NOT NULL;

-- For any remaining NULL (shouldn't happen), set to Ouvert
UPDATE bank_accounts
SET account_status_id = (SELECT id FROM account_statuses WHERE name = 'Ouvert' LIMIT 1)
WHERE account_status_id IS NULL;

-- Drop old varchar column
ALTER TABLE bank_accounts DROP COLUMN IF EXISTS account_status;

-- Make account_status_id NOT NULL
ALTER TABLE bank_accounts ALTER COLUMN account_status_id SET NOT NULL;
