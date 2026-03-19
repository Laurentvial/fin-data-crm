-- Migration: Change fournisseur from boolean to text
-- Converts existing: true -> 'Oui', false/NULL -> NULL
ALTER TABLE companies ALTER COLUMN fournisseur TYPE varchar(255) USING (
  CASE WHEN fournisseur = true THEN 'Oui' ELSE NULL END
);
