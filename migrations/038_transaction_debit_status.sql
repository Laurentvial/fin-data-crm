-- Statut optionnel pour les débits (OK, à vérifier, annulé/bloqué). NULL pour crédits ou non renseigné.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS debit_status varchar(32) NULL;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_debit_status_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_debit_status_check CHECK (
    debit_status IS NULL
    OR debit_status IN ('ok', 'a_verifier', 'annulee_bloquee')
  );

CREATE INDEX IF NOT EXISTS ix_transactions_debit_status ON transactions (debit_status);
