-- Default billing client per bank account; optional per-transaction override

ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS default_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_transactions_customer_id ON transactions(customer_id);
