ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_by_card boolean NOT NULL DEFAULT false;
