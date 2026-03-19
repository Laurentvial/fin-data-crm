-- Migration: Add is_default to company_emails and company_phones
-- Allows user to mark one email and one phone as default per company

ALTER TABLE company_emails ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE company_phones ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Set first email per company as default if none exists
UPDATE company_emails ce
SET is_default = true
WHERE NOT EXISTS (
  SELECT 1 FROM company_emails ce2
  WHERE ce2.company_id = ce.company_id AND ce2.is_default = true
)
AND ce.id = (
  SELECT id FROM company_emails
  WHERE company_id = ce.company_id
  ORDER BY created_at ASC
  LIMIT 1
);

-- Set first phone per company as default if none exists
UPDATE company_phones cp
SET is_default = true
WHERE NOT EXISTS (
  SELECT 1 FROM company_phones cp2
  WHERE cp2.company_id = cp.company_id AND cp2.is_default = true
)
AND cp.id = (
  SELECT id FROM company_phones
  WHERE company_id = cp.company_id
  ORDER BY created_at ASC
  LIMIT 1
);
