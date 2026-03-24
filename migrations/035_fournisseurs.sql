-- Fournisseurs catalog + optional link on transactions

CREATE TABLE IF NOT EXISTS fournisseurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_fournisseurs_sort_order ON fournisseurs(sort_order);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fournisseur_id uuid REFERENCES fournisseurs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_transactions_fournisseur_id ON transactions(fournisseur_id);
