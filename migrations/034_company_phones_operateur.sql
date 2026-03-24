-- Opérateur (réseau mobile / opérateur) pour chaque numéro de société
ALTER TABLE company_phones
  ADD COLUMN IF NOT EXISTS operateur varchar(120);
