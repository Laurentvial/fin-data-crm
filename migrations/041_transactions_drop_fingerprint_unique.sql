-- Allow multiple transactions with the same bank account, date, amount and description
-- (e.g. repeated imports from PDF or legitimate duplicate lines).

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS uix_bank_account_transaction;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS uix_company_transaction;

DROP INDEX IF EXISTS uix_bank_account_transaction;
DROP INDEX IF EXISTS uix_company_transaction;
