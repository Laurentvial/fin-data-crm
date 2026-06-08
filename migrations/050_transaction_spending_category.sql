-- Catégorie de dépense optionnelle pour les transactions débit.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS spending_category varchar(32) NULL;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_spending_category_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_spending_category_check CHECK (
    spending_category IS NULL
    OR spending_category IN ('META', 'Ads setup', 'Domain', 'Dev', 'Autre')
  );

CREATE INDEX IF NOT EXISTS ix_transactions_spending_category ON transactions (spending_category);
