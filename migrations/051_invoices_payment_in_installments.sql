ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_in_installments boolean NOT NULL DEFAULT false;
