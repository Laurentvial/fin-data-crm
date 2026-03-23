-- Migration: Add BIC/SWIFT column to banks
ALTER TABLE banks ADD COLUMN IF NOT EXISTS bic varchar(11);
