-- Migration: allow invoices without a due date (manual invoices, etc.)

ALTER TABLE invoices
  ALTER COLUMN due_date DROP NOT NULL;
