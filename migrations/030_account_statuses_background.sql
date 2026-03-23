-- Migration: Add background color and opacity to account statuses (for compte card customization)
-- Both can be NULL (no customization)

ALTER TABLE account_statuses ADD COLUMN IF NOT EXISTS background_color varchar(7) NULL;
ALTER TABLE account_statuses ADD COLUMN IF NOT EXISTS background_opacity real NULL;
