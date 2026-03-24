/**
 * Opérateurs mobiles sur le marché français (réseaux nationaux et MVNO courants).
 * Valeurs stockées en base = libellés affichés. Tri alphabétique (fr).
 */
const FR_MOBILE_OPERATORS_LIST = [
  "Auchan Télécom",
  "B&You",
  "Bouygues Telecom",
  "Cdiscount Mobile",
  "CIC Mobile",
  "Coriolis Telecom",
  "Free Mobile",
  "Joe Mobile",
  "Keyyo Mobile",
  "La Poste Mobile",
  "Lebara Mobile",
  "Lycamobile",
  "NRJ Mobile",
  "OnOff Mobile",
  "Orange",
  "Prixtel",
  "RED by SFR",
  "Réglo Mobile",
  "SFR",
  "Sosh",
  "Syma",
  "Transatel Mobile",
  "Ubigi",
  "Vectone Mobile",
  "Virgin Mobile",
  "YouPrice Mobile",
] as const;

export const FR_MOBILE_OPERATORS: readonly string[] = [...FR_MOBILE_OPERATORS_LIST].sort((a, b) =>
  a.localeCompare(b, "fr", { sensitivity: "base" })
);

const operatorSet = new Set(FR_MOBILE_OPERATORS);

/** Valeur contrôlée pour un &lt;select&gt; (chaîne vide = non renseigné). */
export function operateurToSelectValue(v: string | null | undefined): string {
  return v?.trim() ?? "";
}

export function needsLegacyOperateurOption(v: string | null | undefined): boolean {
  const t = v?.trim();
  if (!t) return false;
  return !operatorSet.has(t);
}
