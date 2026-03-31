import countries from "i18n-iso-countries";
import type { LocaleData } from "i18n-iso-countries";
import fr from "i18n-iso-countries/langs/fr.json";

countries.registerLocale(fr as LocaleData);

/** Codes retirés des listes (non proposés à la sélection ni en libellé). */
const EXCLUDED_ALPHA2 = new Set(["PS"]);

/** ISO 3166-1 alpha-2 → nom officiel en français (y compris territoires usuels). */
export const COUNTRY_LABELS_FR: Record<string, string> = Object.fromEntries(
  Object.entries(
    countries.getNames("fr", { select: "official" }) as Record<string, string>
  ).filter(([code]) => !EXCLUDED_ALPHA2.has(code))
);

/**
 * Options pour les sélecteurs de pays (société, gérant, pays de naissance),
 * triées par libellé français.
 */
export const PAYS_NAISSANCE_OPTIONS: { code: string; label: string }[] = Object.entries(
  COUNTRY_LABELS_FR
)
  .map(([code, label]) => ({ code, label }))
  .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
