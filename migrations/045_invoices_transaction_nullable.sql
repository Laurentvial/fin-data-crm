-- Migration: allow invoices without a transaction
-- Invoices created manually should not require a linked transaction.

ALTER TABLE invoices
  ALTER COLUMN transaction_id DROP NOT NULL;

