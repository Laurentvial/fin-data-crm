-- Migration: Add vat_rates array to companies (a societe can use different VAT rates per service)
-- vat_rate remains for backward compatibility; vat_rates is the source of truth
ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_rates jsonb;

-- Migrate existing vat_rate to vat_rates
UPDATE companies
SET vat_rates = jsonb_build_array(COALESCE(vat_rate, 20))
WHERE vat_rates IS NULL;

-- Default for new rows
ALTER TABLE companies ALTER COLUMN vat_rates SET DEFAULT '[20]'::jsonb;
