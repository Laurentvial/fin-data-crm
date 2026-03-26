/** Réponse normalisée pour `POST /api/company-lookup` (toute source). */
export type CompanyLookupPayload = {
  name: string | null;
  address: string | null;
  code_postal: string | null;
  ville: string | null;
  country_code: string; // ex. FR
  siret: string | null;
  forme_juridique: string | null;
  activite: string | null;
  date_immatriculation: string | null;
  vat_number_suggested: string | null;
  /** Si la source le fournit (ex. Pappers). */
  directeur?: string | null;
  capital_social?: string | null;
  warnings: string[];
};
