import type { CompanyLookupPayload } from "@/lib/company-lookup-types";
import { mapPappersEntreprise } from "./map-pappers";
import { normalizeSirenOrSiret } from "./siren-siret";

const BASE = "https://api.pappers.fr/v2";

export type { CompanyLookupPayload };

function normalizeApiKey(): string {
  let k =
    (process.env.PAPPERS_API_KEY ?? process.env.PAPPERS_TOKEN ?? "").trim().replace(/^\uFEFF/, "");
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
  }
  return k;
}

export async function fetchCompanyFromPappers(raw: string) {
  const norm = normalizeSirenOrSiret(raw);
  if (!norm) {
    return { ok: false as const, error: "Indiquez un SIREN (9 chiffres) ou un SIRET (14 chiffres)." };
  }

  const apiKey = normalizeApiKey();
  if (!apiKey) {
    return {
      ok: false as const,
      error:
        "Configuration Pappers manquante : définissez PAPPERS_API_KEY dans `.env.local` (clé API depuis https://www.pappers.fr/api ).",
    };
  }

  const qs = new URLSearchParams();
  if (norm.kind === "siren") qs.set("siren", norm.value);
  else qs.set("siret", norm.value);

  const url = `${BASE}/entreprise?${qs.toString()}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "api-key": apiKey,
    },
  });

  const text = await res.text();

  if (res.status === 404) {
    return { ok: false as const, error: "Aucune entreprise trouvée pour ce SIREN ou SIRET." };
  }
  if (res.status === 401) {
    return {
      ok: false as const,
      error: "Clé API Pappers refusée : vérifiez PAPPERS_API_KEY (header api-key).",
    };
  }
  if (res.status === 429) {
    return { ok: false as const, error: "Trop de requêtes vers l'API Pappers. Réessayez plus tard." };
  }
  if (res.status === 400) {
    return {
      ok: false as const,
      error: `Requête Pappers invalide. ${text.slice(0, 300)}`,
    };
  }
  if (!res.ok && res.status !== 206) {
    return {
      ok: false as const,
      error: `Erreur Pappers (${res.status}). ${text.slice(0, 400)}`,
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false as const, error: "Réponse Pappers illisible." };
  }

  if (res.status === 206) {
    const mapped = mapPappersEntreprise(data);
    mapped.warnings = [
      ...mapped.warnings,
      "Réponse partielle : au moins une source n'a pas répondu à temps (code 206).",
    ];
    return { ok: true as const, data: mapped };
  }

  return { ok: true as const, data: mapPappersEntreprise(data) };
}
