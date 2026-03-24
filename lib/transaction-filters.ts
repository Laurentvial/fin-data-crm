import type { BankAccount, Transaction, TransactionType } from "@/lib/types";

export interface TransactionFilterValues {
  bankFilter: { mode: "all" } | { mode: "include"; ids: string[] };
  dateFrom: string;
  dateTo: string;
  typeFilter: { mode: "all" } | { mode: "include"; types: TransactionType[] };
  descriptionContains: string;
  amountMin: string;
  amountMax: string;
  /** null = tous les ajouteurs */
  processedByFilter: null | { mode: "include"; names: string[] };
}

export const DEFAULT_TRANSACTION_FILTERS: TransactionFilterValues = {
  bankFilter: { mode: "all" },
  dateFrom: "",
  dateTo: "",
  typeFilter: { mode: "all" },
  descriptionContains: "",
  amountMin: "",
  amountMax: "",
  processedByFilter: null,
};

export function bankAccountDisplayName(ba: BankAccount): string {
  return ba.company_name !== ba.name ? `${ba.name} – ${ba.company_name}` : ba.name;
}

export function transactionAccountLabel(t: Transaction): string {
  const account = t.bank_account_name ?? "";
  const company = t.company_name ?? "";
  if (account && company && account !== company) return `${account} – ${company}`;
  return account || company || "";
}

/** Paramètres API : un seul compte / un seul type quand c’est possible. */
export function filtersToApiParams(f: TransactionFilterValues): {
  bank_account_id: string;
  date_from: string;
  date_to: string;
  type: string;
} {
  const bank_account_id =
    f.bankFilter.mode === "include" && f.bankFilter.ids.length === 1 ? f.bankFilter.ids[0] : "";
  const type =
    f.typeFilter.mode === "include" && f.typeFilter.types.length === 1 ? f.typeFilter.types[0] : "";
  return {
    bank_account_id,
    date_from: f.dateFrom,
    date_to: f.dateTo,
    type,
  };
}

export function applyClientTransactionFilters(
  rows: Transaction[],
  f: TransactionFilterValues
): Transaction[] {
  return rows.filter((t) => {
    if (f.bankFilter.mode === "include") {
      const ids = f.bankFilter.ids;
      if (ids.length === 0) return false;
      if (ids.length > 1 && !ids.includes(t.bank_account_id)) return false;
    }

    if (f.typeFilter.mode === "include") {
      const types = f.typeFilter.types;
      if (types.length === 0) return false;
      if (types.length > 1 && !types.includes(t.type)) return false;
    }

    const q = f.descriptionContains.trim().toLowerCase();
    if (q && !(t.description ?? "").toLowerCase().includes(q)) return false;

    const minN = f.amountMin.trim() === "" ? null : Number(f.amountMin.replace(",", "."));
    const maxN = f.amountMax.trim() === "" ? null : Number(f.amountMax.replace(",", "."));
    const signed = t.type === "DEBIT" ? -Number(t.amount) : Number(t.amount);
    if (minN != null && !Number.isNaN(minN) && signed < minN) return false;
    if (maxN != null && !Number.isNaN(maxN) && signed > maxN) return false;

    if (f.processedByFilter !== null) {
      const names = f.processedByFilter.names;
      if (names.length === 0) return false;
      const n = t.processed_by_user_name ?? "";
      const key = n === "" ? PROCESSED_BY_EMPTY_KEY : n;
      if (!names.includes(key)) return false;
    }

    return true;
  });
}

/** Valeur sentinelle pour « pas d’utilisateur » dans les filtres multi-sélection. */
export const PROCESSED_BY_EMPTY_KEY = "\u2060empty\u2060";

export function getAllBankIdsForFilter(rows: Transaction[], bankAccounts: BankAccount[]): string[] {
  const s = new Set<string>();
  for (const ba of bankAccounts) s.add(ba.id);
  for (const t of rows) s.add(t.bank_account_id);
  return [...s];
}

export function getProcessedByFilterKeys(rows: Transaction[]): string[] {
  const names = new Set<string>();
  let hasEmpty = false;
  for (const t of rows) {
    const n = t.processed_by_user_name ?? "";
    if (n === "") hasEmpty = true;
    else names.add(n);
  }
  const list = [...names].sort((a, b) => a.localeCompare(b, "fr"));
  if (hasEmpty) list.unshift(PROCESSED_BY_EMPTY_KEY);
  return list;
}

export function normalizeTransactionFilters(
  f: TransactionFilterValues,
  ctx: { allBankIds: string[]; allProcessedKeys: string[] }
): TransactionFilterValues {
  const out: TransactionFilterValues = { ...f };

  if (f.bankFilter.mode === "include" && ctx.allBankIds.length > 0) {
    const a = new Set(ctx.allBankIds);
    const b = new Set(f.bankFilter.ids);
    if (a.size === b.size && ctx.allBankIds.every((id) => b.has(id))) {
      out.bankFilter = { mode: "all" };
    }
  }

  if (f.typeFilter.mode === "include") {
    const types = f.typeFilter.types;
    if (types.includes("DEBIT") && types.includes("CREDIT") && types.length === 2) {
      out.typeFilter = { mode: "all" };
    }
  }

  if (f.processedByFilter !== null && ctx.allProcessedKeys.length > 0) {
    const n = new Set(f.processedByFilter.names);
    if (ctx.allProcessedKeys.every((k) => n.has(k)) && n.size === ctx.allProcessedKeys.length) {
      out.processedByFilter = null;
    }
  }

  return out;
}

export function columnHasActiveFilter(
  columnId: string,
  f: TransactionFilterValues
): boolean {
  switch (columnId) {
    case "bank_account_name":
      return f.bankFilter.mode === "include";
    case "transaction_date":
      return Boolean(f.dateFrom || f.dateTo);
    case "type":
      return f.typeFilter.mode === "include";
    case "description":
      return Boolean(f.descriptionContains.trim());
    case "amount":
      return Boolean(f.amountMin.trim() || f.amountMax.trim());
    case "processed_by_user_name":
      return f.processedByFilter !== null;
    default:
      return false;
  }
}
