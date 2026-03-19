-- Migration: Add extra fields to companies (vps, forme juridique, capital social, code postal, ville, activite, date immatriculation)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS vps varchar(255);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS forme_juridique varchar(100);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS capital_social varchar(100);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS code_postal varchar(20);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ville varchar(255);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS activite text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS date_immatriculation date;
