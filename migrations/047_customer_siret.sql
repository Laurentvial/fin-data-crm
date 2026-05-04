-- Migration: customer SIRET on customers + invoices

ALTER TABLE customers ADD COLUMN IF NOT EXISTS siret varchar(50);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_siret varchar(50);
