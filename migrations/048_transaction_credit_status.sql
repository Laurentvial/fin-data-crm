-- Statut optionnel pour les crédits : NULL (vide) ou payé.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS credit_status varchar(32) NULL;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_credit_status_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_credit_status_check CHECK (
    credit_status IS NULL
    OR credit_status IN ('paye')
  );

CREATE INDEX IF NOT EXISTS ix_transactions_credit_status ON transactions (credit_status);
