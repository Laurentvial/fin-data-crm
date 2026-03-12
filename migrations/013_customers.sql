-- Migration: Customers table linked to companies for invoice reuse
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  vat_number varchar(50),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_customers_company_id ON customers(company_id);

-- Add customer_id to invoices (nullable for backward compatibility)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_invoices_customer_id ON invoices(customer_id);
