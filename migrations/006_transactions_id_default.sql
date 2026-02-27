-- Migration: Add default UUID for transactions.id
-- Fixes "Échec de la création d'une transaction" - id column had no default
ALTER TABLE transactions ALTER COLUMN id SET DEFAULT gen_random_uuid();
