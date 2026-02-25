-- Migration: Company details - emails and files tables
-- company_emails: store email credentials (password encrypted in app)
-- company_files: store logo and kbis as bytea

CREATE TABLE IF NOT EXISTS company_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email varchar(255) NOT NULL,
  password varchar(500) NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_company_emails_company_id ON company_emails(company_id);

CREATE TABLE IF NOT EXISTS company_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_type varchar(20) NOT NULL,
  filename varchar(255),
  content_type varchar(100),
  data_base64 text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  UNIQUE(company_id, file_type)
);

CREATE INDEX IF NOT EXISTS ix_company_files_company_id ON company_files(company_id);
