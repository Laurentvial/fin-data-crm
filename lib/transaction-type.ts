import type { TransactionType } from "@/lib/types";

/** Crédit « classique » ou crédit interne (virement) : montant positif au solde, hors débit. */
export function isCreditLikeType(t: TransactionType): boolean {
  return t === "CREDIT" || t === "INTERNAL_CREDIT";
}

export function transactionTypeLabel(t: TransactionType): string {
  if (t === "CREDIT") return "Crédit";
  if (t === "INTERNAL_CREDIT") return "Crédit interne";
  return "Débit";
}
