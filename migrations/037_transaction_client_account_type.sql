-- Client colonne transactions = Paramètres › Clients (account_types), pas customers (factures)

ALTER TABLE bank_accounts DROP COLUMN IF EXISTS default_customer_id;

ALTER TABLE transactions DROP COLUMN IF EXISTS customer_id;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_account_type_id uuid REFERENCES account_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_transactions_client_account_type_id ON transactions(client_account_type_id);
