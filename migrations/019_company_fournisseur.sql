-- Migration: Add fournisseur field to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS fournisseur boolean DEFAULT false;
