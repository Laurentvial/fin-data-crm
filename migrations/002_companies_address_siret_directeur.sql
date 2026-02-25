-- Migration: Add address, siret, directeur columns to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS siret varchar(14);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS directeur varchar(255);
