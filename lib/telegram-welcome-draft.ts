import type { IbanItem } from "@/lib/types";

/** Même structure que l’ancien message automatique à la création (create-group). */
export function buildTelegramWelcomeDraft(parts: {
  companyName: string;
  address?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  email?: string | null;
  siret?: string | null;
  directeur?: string | null;
  ibans?: IbanItem[] | null;
  bankName?: string | null;
}): string {
  const addrParts = [
    typeof parts.address === "string" ? parts.address.trim() : "",
    typeof parts.codePostal === "string" ? parts.codePostal.trim() : "",
    typeof parts.ville === "string" ? parts.ville.trim() : "",
  ].filter(Boolean);
  const addressLine = addrParts.length > 0 ? addrParts.join(", ") : "—";
  const list = Array.isArray(parts.ibans) ? parts.ibans : [];
  const ibanStr =
    list.length > 0
      ? list
          .map((i) => {
            const iban = (i?.iban ?? "").trim().replace(/\s/g, "").toUpperCase();
            const bic = (i?.bic ?? "").trim().replace(/\s/g, "").toUpperCase();
            if (!iban) return "";
            return bic ? `${iban} (BIC: ${bic})` : iban;
          })
          .filter(Boolean)
          .join(", ") || "—"
      : "—";

  return [
    `NOM STE : ${(parts.companyName ?? "").trim() || "—"}`,
    `ADRESSE : ${addressLine}`,
    `EMAIL : ${(parts.email ?? "").trim() || "—"}`,
    `SIRET : ${(parts.siret ?? "").trim() || "—"}`,
    `DIRECTEUR : ${(parts.directeur ?? "").trim() || "—"}`,
    `IBAN : ${ibanStr}`,
    `BANQUE : ${(parts.bankName ?? "").trim() || "—"}`,
  ].join("\n\n");
}
