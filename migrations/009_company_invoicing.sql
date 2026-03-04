-- Migration: Add invoicing fields to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS country_code char(2) NOT NULL DEFAULT 'FR';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_number varchar(50);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) DEFAULT 20;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_prefix varchar(20) DEFAULT 'FAC-';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_next_number integer DEFAULT 1;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS currency char(3) DEFAULT 'EUR';
