-- Migration: Add source_id to companies (replaces fournisseur)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES sources(id) ON DELETE SET NULL;
