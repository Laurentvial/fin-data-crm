-- Migration: Add URL column to banks
ALTER TABLE banks ADD COLUMN IF NOT EXISTS url varchar(500);
