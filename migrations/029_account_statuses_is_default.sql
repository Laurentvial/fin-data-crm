-- Migration: Add is_default to account_statuses
-- One status can be marked as default (used when creating bank accounts without explicit status)

ALTER TABLE account_statuses ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Set 'Ouvert' as default if it exists
UPDATE account_statuses SET is_default = true
WHERE id IN (SELECT id FROM account_statuses WHERE name = 'Ouvert' LIMIT 1);

-- If no default yet, set the first one by sort_order
UPDATE account_statuses SET is_default = true
WHERE id IN (SELECT id FROM account_statuses ORDER BY sort_order, name LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM account_statuses WHERE is_default = true);
