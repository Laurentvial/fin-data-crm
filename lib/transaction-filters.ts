import type { BankAccount, Transaction, TransactionType } from "@/lib/types";

/** Mode du filtre min/max sur la colonne Montant : signé (comme à l’écran) ou montant brut par type. */
export type TransactionAmountFilterMode = "signed" | TransactionType;

export interface TransactionFilterValues {
  bankFilter: { mode: "all" } | { mode: "include"; ids: string[] };
  /** null = toutes les banques (noms d’établissement) */
  bankNameFilter: null | { mode: "include"; names: string[] };
  /** null = tous les statuts de compte */
  accountStatusFilter: null | { mode: "include"; names: string[] };
  /** null = toutes les sociétés */
  companyFilter: null | { mode: "include"; names: string[] };
  dateFrom: string;
  dateTo: string;
  typeFilter: { mode: "all" } | { mode: "include"; types: TransactionType[] };
  descriptionContains: string;
  amountMin: string;
  amountMax: string;
  /** Avec min/max : compare le montant signé (débit négatif) ou uniquement les lignes débit / crédit (montant positif stocké). */
  amountFilterMode: TransactionAmountFilterMode;
  /** null = tous les ajouteurs */
  processedByFilter: null | { mode: "include"; names: string[] };
}

export const DEFAULT_TRANSACTION_FILTERS: TransactionFilterValues = {
  bankFilter: { mode: "all" },
  bankNameFilter: null,
  accountStatusFilter: null,
  companyFilter: null,
  dateFrom: "",
  dateTo: "",
  typeFilter: { mode: "all" },
  descriptionContains: "",
  amountMin: "",
  amountMax: "",
  amountFilterMode: "signed",
  processedByFilter: null,
};

export function bankAccountDisplayName(ba: BankAccount): string {
  return ba.company_name !== ba.name ? `${ba.name} – ${ba.company_name}` : ba.name;
}

export function transactionAccountLabel(t: Transaction): string {
  return t.bank_account_name ?? "";
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

    if (f.bankNameFilter !== null) {
      const names = f.bankNameFilter.names;
      if (names.length === 0) return false;
      const key = transactionBankNameFilterKey(t);
      if (!names.includes(key)) return false;
    }

    if (f.accountStatusFilter !== null) {
      const names = f.accountStatusFilter.names;
      if (names.length === 0) return false;
      const key = transactionAccountStatusFilterKey(t);
      if (!names.includes(key)) return false;
    }

    if (f.companyFilter !== null) {
      const names = f.companyFilter.names;
      if (names.length === 0) return false;
      const n = t.company_name ?? "";
      const key = n === "" ? COMPANY_EMPTY_KEY : n;
      if (!names.includes(key)) return false;
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
    const hasAmountBounds =
      (minN != null && !Number.isNaN(minN)) || (maxN != null && !Number.isNaN(maxN));
    if (hasAmountBounds) {
      const raw = Number(t.amount);
      if (f.amountFilterMode === "signed") {
        const signed = t.type === "DEBIT" ? -raw : raw;
        if (minN != null && !Number.isNaN(minN) && signed < minN) return false;
        if (maxN != null && !Number.isNaN(maxN) && signed > maxN) return false;
      } else if (f.amountFilterMode === "DEBIT") {
        if (t.type !== "DEBIT") return false;
        if (minN != null && !Number.isNaN(minN) && raw < minN) return false;
        if (maxN != null && !Number.isNaN(maxN) && raw > maxN) return false;
      } else {
        if (t.type !== "CREDIT") return false;
        if (minN != null && !Number.isNaN(minN) && raw < minN) return false;
        if (maxN != null && !Number.isNaN(maxN) && raw > maxN) return false;
      }
    }

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

/** Valeur sentinelle pour société vide dans les filtres multi-sélection. */
export const COMPANY_EMPTY_KEY = "\u2060company\u2060";

/** Valeur sentinelle pour banque (nom) vide. */
export const BANK_EMPTY_KEY = "\u2060bank\u2060";

/** Valeur sentinelle pour statut de compte vide. */
export const ACCOUNT_STATUS_EMPTY_KEY = "\u2060acctst\u2060";

export function transactionBankNameFilterKey(t: Transaction): string {
  const n = (t.bank_name ?? "").trim();
  return n === "" ? BANK_EMPTY_KEY : n;
}

/** Clé alignée sur l’affichage tableau (emoji + nom). */
export function transactionAccountStatusFilterKey(t: Transaction): string {
  const emoji = (t.account_status_emoji ?? "").trim();
  const name = (t.account_status_name ?? "").trim();
  if (!name && !emoji) return ACCOUNT_STATUS_EMPTY_KEY;
  return [emoji, name].filter(Boolean).join(" ").trim();
}

export function getBankNameFilterKeys(rows: Transaction[]): string[] {
  const names = new Set<string>();
  let hasEmpty = false;
  for (const t of rows) {
    const k = transactionBankNameFilterKey(t);
    if (k === BANK_EMPTY_KEY) hasEmpty = true;
    else names.add(k);
  }
  const list = [...names].sort((a, b) => a.localeCompare(b, "fr"));
  if (hasEmpty) list.unshift(BANK_EMPTY_KEY);
  return list;
}

export function getAccountStatusFilterKeys(rows: Transaction[]): string[] {
  const keys = new Set<string>();
  let hasEmpty = false;
  for (const t of rows) {
    const k = transactionAccountStatusFilterKey(t);
    if (k === ACCOUNT_STATUS_EMPTY_KEY) hasEmpty = true;
    else keys.add(k);
  }
  const list = [...keys].sort((a, b) => a.localeCompare(b, "fr"));
  if (hasEmpty) list.unshift(ACCOUNT_STATUS_EMPTY_KEY);
  return list;
}

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

export function getCompanyFilterKeys(rows: Transaction[]): string[] {
  const names = new Set<string>();
  let hasEmpty = false;
  for (const t of rows) {
    const n = t.company_name ?? "";
    if (n === "") hasEmpty = true;
    else names.add(n);
  }
  const list = [...names].sort((a, b) => a.localeCompare(b, "fr"));
  if (hasEmpty) list.unshift(COMPANY_EMPTY_KEY);
  return list;
}

export function normalizeTransactionFilters(
  f: TransactionFilterValues,
  ctx: {
    allBankIds: string[];
    allBankNameKeys: string[];
    allAccountStatusKeys: string[];
    allProcessedKeys: string[];
    allCompanyKeys: string[];
  }
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

  if (f.bankNameFilter !== null && ctx.allBankNameKeys.length > 0) {
    const n = new Set(f.bankNameFilter.names);
    if (ctx.allBankNameKeys.every((k) => n.has(k)) && n.size === ctx.allBankNameKeys.length) {
      out.bankNameFilter = null;
    }
  }

  if (f.accountStatusFilter !== null && ctx.allAccountStatusKeys.length > 0) {
    const n = new Set(f.accountStatusFilter.names);
    if (
      ctx.allAccountStatusKeys.every((k) => n.has(k)) &&
      n.size === ctx.allAccountStatusKeys.length
    ) {
      out.accountStatusFilter = null;
    }
  }

  if (f.companyFilter !== null && ctx.allCompanyKeys.length > 0) {
    const n = new Set(f.companyFilter.names);
    if (ctx.allCompanyKeys.every((k) => n.has(k)) && n.size === ctx.allCompanyKeys.length) {
      out.companyFilter = null;
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

/** Indique si au moins un filtre du tableau restreint les lignes affichées (hors tri). */
export function hasActiveTransactionFilters(f: TransactionFilterValues): boolean {
  if (f.bankFilter.mode === "include") return true;
  if (f.bankNameFilter !== null) return true;
  if (f.accountStatusFilter !== null) return true;
  if (f.companyFilter !== null) return true;
  if (Boolean(f.dateFrom.trim() || f.dateTo.trim())) return true;
  if (f.typeFilter.mode === "include") return true;
  if (Boolean(f.descriptionContains.trim())) return true;
  if (Boolean(f.amountMin.trim() || f.amountMax.trim())) return true;
  if (f.processedByFilter !== null) return true;
  return false;
}

export function columnHasActiveFilter(
  columnId: string,
  f: TransactionFilterValues
): boolean {
  switch (columnId) {
    case "bank_name":
      return f.bankNameFilter !== null;
    case "account_status_name":
      return f.accountStatusFilter !== null;
    case "company_name":
      return f.companyFilter !== null;
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
