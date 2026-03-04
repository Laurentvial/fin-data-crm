-- Migration: Invoice templates and invoices tables
CREATE TABLE IF NOT EXISTS invoice_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  country_code char(2) NOT NULL,
  template_content text NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_invoice_templates_company_id ON invoice_templates(company_id);
CREATE INDEX IF NOT EXISTS ix_invoice_templates_country_code ON invoice_templates(country_code);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  invoice_number varchar(50) NOT NULL UNIQUE,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  customer_name text NOT NULL,
  customer_address text,
  customer_vat varchar(50),
  line_items jsonb NOT NULL DEFAULT '[]',
  subtotal numeric NOT NULL,
  tax_amount numeric NOT NULL,
  total numeric NOT NULL,
  currency char(3) NOT NULL DEFAULT 'EUR',
  status varchar(20) NOT NULL DEFAULT 'issued',
  pdf_url text,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_invoices_company_id ON invoices(company_id);
CREATE INDEX IF NOT EXISTS ix_invoices_transaction_id ON invoices(transaction_id);
CREATE INDEX IF NOT EXISTS ix_invoices_invoice_number ON invoices(invoice_number);
