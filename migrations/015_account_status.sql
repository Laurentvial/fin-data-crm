-- Migration: Account status for bank accounts
-- Status: Ouvert (default), Fermé, Problème

ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_status varchar(20) NOT NULL DEFAULT 'Ouvert';
