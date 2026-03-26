import type { CompanyLookupPayload } from "@/lib/company-lookup-types";
import { frenchVatFromSiren } from "./siren-siret";

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function formatRepresentant(r: Record<string, unknown>): string | null {
  if (r.personne_morale === true) {
    return str(r.denomination);
  }
  const pre = str(r.prenom_usuel) ?? str(r.prenom);
  const nom = str(r.nom);
  if (pre && nom) return `${pre} ${nom}`.trim();
  return nom ?? pre ?? null;
}

function buildAddressFromEtab(etab: Record<string, unknown>): string {
  const l1 = str(etab.adresse_ligne_1);
  const l2 = str(etab.adresse_ligne_2);
  return [l1, l2].filter(Boolean).join(", ").replace(/\s+/g, " ").trim();
}

/** Carte JSON `GET /v2/entreprise` (schéma EntrepriseFiche). */
export function mapPappersEntreprise(data: unknown): CompanyLookupPayload {
  const warnings: string[] = [];
  if (!data || typeof data !== "object") {
    return {
      name: null,
      address: null,
      code_postal: null,
      ville: null,
      country_code: "FR",
      siret: null,
      forme_juridique: null,
      activite: null,
      date_immatriculation: null,
      vat_number_suggested: null,
      directeur: null,
      capital_social: null,
      warnings: ["Réponse Pappers invalide."],
    };
  }

  const d = data as Record<string, unknown>;
  if (d.diffusable === false) {
    warnings.push(
      "Diffusion partielle (entreprise non diffusable ou masquée) : certains champs peuvent être vides."
    );
  }

  const siege = d.siege as Record<string, unknown> | undefined;
  const etablissement = d.etablissement as Record<string, unknown> | undefined;
  const etab = etablissement ?? siege;

  const siren = str(d.siren);
  let siretOut: string | null = null;
  if (etab) siretOut = str(etab.siret);
  if (!siretOut && siege) siretOut = str(siege.siret);

  const nom =
    str(d.nom_entreprise) ??
    (d.personne_morale === false
      ? [str(d.prenom), str(d.nom)].filter(Boolean).join(" ").trim() || null
      : null) ??
    str(d.denomination);

  const codeNaf = str(d.code_naf) ?? (etab ? str(etab.code_naf) : null);
  const libNaf = str(d.libelle_code_naf) ?? (etab ? str(etab.libelle_code_naf) : null);
  const activite =
    codeNaf && libNaf ? `${libNaf} (${codeNaf})` : libNaf ?? codeNaf ?? null;

  let vat = str(d.numero_tva_intracommunautaire);
  if (!vat && siren && /^\d{9}$/.test(siren)) {
    vat = frenchVatFromSiren(siren) || null;
  }

  const cp = etab ? str(etab.code_postal) : null;
  const ville = etab ? str(etab.ville) : null;
  const pays = (etab ? str(etab.code_pays) : null) ?? "FR";

  let directeur: string | null = null;
  const reps = d.representants;
  if (Array.isArray(reps) && reps.length > 0) {
    const first = reps[0];
    if (first && typeof first === "object") {
      directeur = formatRepresentant(first as Record<string, unknown>);
    }
  }

  return {
    name: nom,
    address: etab ? buildAddressFromEtab(etab) || null : null,
    code_postal: cp,
    ville: ville,
    country_code: pays.length === 2 ? pays.toUpperCase() : "FR",
    siret: siretOut,
    forme_juridique: str(d.forme_juridique),
    activite,
    date_immatriculation: str(d.date_creation) ?? str(d.date_immatriculation_rcs),
    vat_number_suggested: vat,
    directeur,
    capital_social: str(d.capital_formate),
    warnings,
  };
}
