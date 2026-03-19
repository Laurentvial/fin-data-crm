-- Migration: Add gérant (manager) fields to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_adresse text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_code_postal varchar(20);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_ville varchar(255);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_pays char(2);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_date_naissance date;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_ville_naissance varchar(255);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_code_postal_naissance varchar(20);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_pays_naissance char(2);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_numero_fiscal varchar(50);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_numero_secu varchar(20);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_numero_piece_identite varchar(50);
