import {
  SPENDING_CATEGORY_EMPTY_KEY,
  type TransactionFilterValues,
} from "@/lib/transaction-filters";
import type { Transaction, TransactionType } from "@/lib/types";
import { UNCATEGORIZED_SPENDING_CATEGORY_LABEL } from "@/lib/spending-category";

/** Sentinel URL value for uncategorized spending (matches reporting label). */
export const DRILLDOWN_SPENDING_CATEGORY_NONE = "__none__";

export type TransactionDrilldownParams = {
  dateFrom: string;
  dateTo: string;
  type?: TransactionType;
  /** `null` = sans catégorie ; `undefined` = pas de filtre catégorie. */
  spendingCategory?: string | null;
  bankAccountId?: string;
  companyName?: string;
  bankName?: string;
  clientName?: string;
  excludeInternalTransfers?: boolean;
};

export type TransactionDrilldownUrlState = {
  filterPatch: TransactionFilterValues;
  excludeInternalTransferDebits: boolean;
};

export function buildTransactionDrilldownUrl(params: TransactionDrilldownParams): string {
  const sp = new URLSearchParams();
  if (params.dateFrom) sp.set("date_from", params.dateFrom);
  if (params.dateTo) sp.set("date_to", params.dateTo);
  if (params.type) sp.set("type", params.type);
  if (params.bankAccountId) sp.set("bank_account_id", params.bankAccountId);
  if (params.companyName) sp.set("company_name", params.companyName);
  if (params.bankName) sp.set("bank_name", params.bankName);
  if (params.clientName) sp.set("client_name", params.clientName);
  if (params.spendingCategory === null) {
    sp.set("spending_category", DRILLDOWN_SPENDING_CATEGORY_NONE);
  } else if (params.spendingCategory) {
    sp.set("spending_category", params.spendingCategory);
  }
  if (params.excludeInternalTransfers) sp.set("exclude_internal_transfers", "1");
  const qs = sp.toString();
  return qs ? `/?${qs}` : "/";
}

export function spendingCategoryLabelToDrilldownParam(category: string): string | null {
  return category === UNCATEGORIZED_SPENDING_CATEGORY_LABEL ? null : category;
}

/** Applies only query params that are explicitly present in the URL. */
export function parseTransactionDrilldownSearchParams(
  searchParams: URLSearchParams,
  prev: TransactionFilterValues
): TransactionDrilldownUrlState {
  const next: TransactionFilterValues = { ...prev };
  let excludeInternalTransferDebits = false;

  if (searchParams.has("bank_account_id") || searchParams.has("company_id")) {
    const bankAccountId =
      searchParams.get("bank_account_id") ?? searchParams.get("company_id") ?? "";
    next.bankFilter = bankAccountId ? { mode: "include", ids: [bankAccountId] } : { mode: "all" };
  }

  if (searchParams.has("date_from")) {
    next.dateFrom = searchParams.get("date_from") ?? "";
  }
  if (searchParams.has("date_to")) {
    next.dateTo = searchParams.get("date_to") ?? "";
  }

  if (searchParams.has("type")) {
    const type = searchParams.get("type");
    if (type === "DEBIT" || type === "CREDIT" || type === "INTERNAL_CREDIT") {
      next.typeFilter = { mode: "include", types: [type] };
    } else {
      next.typeFilter = { mode: "all" };
    }
  }

  if (searchParams.has("spending_category")) {
    const raw = searchParams.get("spending_category");
    if (raw === DRILLDOWN_SPENDING_CATEGORY_NONE || raw === "") {
      next.spendingCategoryFilter = { mode: "include", names: [SPENDING_CATEGORY_EMPTY_KEY] };
    } else if (raw) {
      next.spendingCategoryFilter = { mode: "include", names: [raw] };
    } else {
      next.spendingCategoryFilter = null;
    }
  }

  if (searchParams.has("company_name")) {
    const name = searchParams.get("company_name") ?? "";
    next.companyFilter = name ? { mode: "include", names: [name] } : null;
  }

  if (searchParams.has("bank_name")) {
    const name = searchParams.get("bank_name") ?? "";
    next.bankNameFilter = name ? { mode: "include", names: [name] } : null;
  }

  if (searchParams.has("client_name")) {
    const name = searchParams.get("client_name") ?? "";
    next.clientFilter = name ? { mode: "include", names: [name] } : null;
  }

  if (searchParams.get("exclude_internal_transfers") === "1") {
    excludeInternalTransferDebits = true;
  }

  return { filterPatch: next, excludeInternalTransferDebits };
}

export function hasTransactionDrilldownParams(searchParams: URLSearchParams): boolean {
  return (
    searchParams.has("bank_account_id") ||
    searchParams.has("company_id") ||
    searchParams.has("date_from") ||
    searchParams.has("date_to") ||
    searchParams.has("type") ||
    searchParams.has("spending_category") ||
    searchParams.has("company_name") ||
    searchParams.has("bank_name") ||
    searchParams.has("client_name") ||
    searchParams.has("exclude_internal_transfers")
  );
}

/** Exclut les débits sources d'un virement interne (aligné sur le rapport financier). */
export function filterOutInternalTransferDebits(
  rows: Transaction[],
  referenceRows: Transaction[]
): Transaction[] {
  const pairedDebitIds = new Set<string>();
  for (const t of referenceRows) {
    if (t.type === "INTERNAL_CREDIT" && t.internal_transfer_debit_id) {
      pairedDebitIds.add(t.internal_transfer_debit_id);
    }
  }
  if (pairedDebitIds.size === 0) return rows;
  return rows.filter((t) => !(t.type === "DEBIT" && pairedDebitIds.has(t.id)));
}
