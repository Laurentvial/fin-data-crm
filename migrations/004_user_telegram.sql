-- Migration: Store Telegram ID per user for adding them to groups
-- Links neon_auth.user to their Telegram account (id, optional username)

CREATE TABLE IF NOT EXISTS user_telegram (
  user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  telegram_id bigint NOT NULL UNIQUE,
  telegram_username varchar(255),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_user_telegram_telegram_id ON user_telegram(telegram_id);

COMMENT ON TABLE user_telegram IS 'Links app users to their Telegram account for group invites';
