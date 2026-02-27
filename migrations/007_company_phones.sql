-- Migration: Company phones - store phone numbers per company
CREATE TABLE IF NOT EXISTS company_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  phone varchar(50) NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_company_phones_company_id ON company_phones(company_id);
