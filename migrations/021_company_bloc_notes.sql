-- Migration: Add bloc_notes (free-form notes) to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bloc_notes TEXT;
