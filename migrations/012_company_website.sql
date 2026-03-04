-- Migration: Add website column to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website varchar(500);
