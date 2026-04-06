-- Allow bank accounts without a Telegram group until the user links one (CRM-only creation).
ALTER TABLE bank_accounts
  ALTER COLUMN telegram_chat_id DROP NOT NULL;
