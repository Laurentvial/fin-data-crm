import type { TransactionType } from "@/lib/types";

export interface DbTxnMatchRow {
  id: string;
  transaction_date: string;
  amount: number | string;
  type: string;
  description: string | null;
}

export function roundAmount2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Alignement avec l’unicité côté base (souvent date + montant + libellé). */
export function normalizeDescriptionForMatch(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isoDateOnly(d: string | Date): string {
  if (typeof d === "string") {
    const m = d.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1]!;
  }
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  return "";
}

export interface ExtractedLineInput {
  transaction_date: string;
  amount: number;
  type: TransactionType;
  description: string;
}

/**
 * Match relevé vs DB : date + type + montant (2 déc.) + libellé normalisé,
 * comme la contrainte d’unicité métier (bank_account, date, montant, description).
 */
export function findDuplicateCandidates(
  line: ExtractedLineInput,
  dbRows: DbTxnMatchRow[]
): DbTxnMatchRow[] {
  const dateKey = isoDateOnly(line.transaction_date);
  if (!dateKey) return [];
  const amt = roundAmount2(line.amount);
  const descKey = normalizeDescriptionForMatch(line.description);
  return dbRows.filter((r) => {
    const rd = isoDateOnly(r.transaction_date);
    const rDesc = normalizeDescriptionForMatch(r.description);
    const rType = String(r.type ?? "").toUpperCase();
    return (
      rd === dateKey &&
      rType === line.type &&
      roundAmount2(Number(r.amount)) === amt &&
      rDesc === descKey
    );
  });
}

/** Clé pour dédoublonner plusieurs lignes identiques dans un même import (PDF + commit). */
export function importRowDedupKey(parts: {
  transaction_date: string;
  amount: number;
  type: string;
  description: string;
}): string {
  return [
    isoDateOnly(parts.transaction_date),
    String(parts.type),
    String(roundAmount2(Number(parts.amount))),
    normalizeDescriptionForMatch(parts.description),
  ].join("\u001f");
}
