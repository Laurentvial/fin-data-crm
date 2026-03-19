-- Migration: Extend company_files file_type for custom document types
-- Supports: kbis, statut, pi_gerant, pi_recto, pi_verso, selfie, autre_<slug>

ALTER TABLE company_files ALTER COLUMN file_type TYPE varchar(50);
