-- Ajoute les catégories de dépense Google et Frais.

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_spending_category_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_spending_category_check CHECK (
    spending_category IS NULL
    OR spending_category IN ('META', 'Ads setup', 'Domain', 'Dev', 'Google', 'Frais', 'Autre')
  );
