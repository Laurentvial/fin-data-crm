-- Migration: Add invoice_template_id to companies for template selection
ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_template_id uuid REFERENCES invoice_templates(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_companies_invoice_template_id ON companies(invoice_template_id);
