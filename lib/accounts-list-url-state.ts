export type AccountsSortMode =
  | "alpha"
  | "balance_asc"
  | "balance_desc"
  | "status"
  | "created_desc"
  | "created_asc";

export type AccountsBalanceBucket = "all" | "negative" | "zero" | "positive";

export type AccountsListUrlState = {
  search: string;
  sort: AccountsSortMode;
  selectedBankIds: string[];
  selectedStatusIds: string[];
  selectedAccountTypeFilterIds: string[];
  selectedFournisseurKeys: string[];
  balanceBucket: AccountsBalanceBucket;
  balanceRangeMin: number | null;
  balanceRangeMax: number | null;
  createdFromInput: string;
  createdToInput: string;
};

const SORT_MODES: AccountsSortMode[] = [
  "alpha",
  "balance_asc",
  "balance_desc",
  "status",
  "created_desc",
  "created_asc",
];
const BALANCE_BUCKETS: AccountsBalanceBucket[] = ["all", "negative", "zero", "positive"];
const EMPTY_BANK_TOKEN = "__none__";
const ALL_STATUSES_TOKEN = "*";
const FOURNISSEUR_SEP = "|";

const RESERVED_PARAMS = new Set(["edit", "company", "list"]);

function splitCsv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function joinCsv(values: string[]): string {
  return values.join(",");
}

function splitFournisseurKeys(value: string | null): string[] {
  if (!value) return [];
  return value.split(FOURNISSEUR_SEP).map((part) => part.trim()).filter(Boolean);
}

function joinFournisseurKeys(values: string[]): string {
  return values.join(FOURNISSEUR_SEP);
}

function normalizeBankId(id: string): string {
  return id === EMPTY_BANK_TOKEN ? "" : id;
}

function serializeBankId(id: string): string {
  return id === "" ? EMPTY_BANK_TOKEN : id;
}

function sortedIds(ids: string[]): string[] {
  return [...ids].sort();
}

function idsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = sortedIds(a);
  const sb = sortedIds(b);
  return sa.every((value, index) => value === sb[index]);
}

function parseSort(value: string | null): AccountsSortMode {
  if (value && SORT_MODES.includes(value as AccountsSortMode)) {
    return value as AccountsSortMode;
  }
  return "alpha";
}

function parseBalanceBucket(value: string | null): AccountsBalanceBucket {
  if (value && BALANCE_BUCKETS.includes(value as AccountsBalanceBucket)) {
    return value as AccountsBalanceBucket;
  }
  return "all";
}

function parseNumber(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseAccountsListUrlState(
  searchParams: URLSearchParams,
  options: { defaultStatusIds: string[] }
): AccountsListUrlState & { balanceRangeFilterEnabled: boolean } {
  const statusRaw = searchParams.get("status");
  let selectedStatusIds: string[];
  if (statusRaw === ALL_STATUSES_TOKEN) {
    selectedStatusIds = [];
  } else if (statusRaw) {
    selectedStatusIds = splitCsv(statusRaw);
  } else {
    selectedStatusIds = [...options.defaultStatusIds];
  }

  const balanceRangeFilterEnabled =
    searchParams.has("balMin") && searchParams.has("balMax");

  return {
    search: searchParams.get("q")?.trim() ?? "",
    sort: parseSort(searchParams.get("sort")),
    selectedBankIds: splitCsv(searchParams.get("banks")).map(normalizeBankId),
    selectedStatusIds,
    selectedAccountTypeFilterIds: splitCsv(searchParams.get("types")),
    selectedFournisseurKeys: splitFournisseurKeys(searchParams.get("src")),
    balanceBucket: parseBalanceBucket(searchParams.get("bal")),
    balanceRangeMin: balanceRangeFilterEnabled ? parseNumber(searchParams.get("balMin")) : null,
    balanceRangeMax: balanceRangeFilterEnabled ? parseNumber(searchParams.get("balMax")) : null,
    createdFromInput: searchParams.get("from")?.trim() ?? "",
    createdToInput: searchParams.get("to")?.trim() ?? "",
    balanceRangeFilterEnabled,
  };
}

export function accountsListStateEquals(a: AccountsListUrlState, b: AccountsListUrlState): boolean {
  return (
    a.search === b.search &&
    a.sort === b.sort &&
    idsEqual(a.selectedBankIds, b.selectedBankIds) &&
    idsEqual(a.selectedStatusIds, b.selectedStatusIds) &&
    idsEqual(a.selectedAccountTypeFilterIds, b.selectedAccountTypeFilterIds) &&
    idsEqual(a.selectedFournisseurKeys, b.selectedFournisseurKeys) &&
    a.balanceBucket === b.balanceBucket &&
    a.balanceRangeMin === b.balanceRangeMin &&
    a.balanceRangeMax === b.balanceRangeMax &&
    a.createdFromInput === b.createdFromInput &&
    a.createdToInput === b.createdToInput
  );
}

export function serializeAccountsListUrlState(
  state: AccountsListUrlState,
  options: {
    defaultStatusIds: string[];
    balanceRangeFilterActive?: boolean;
  }
): URLSearchParams {
  const params = new URLSearchParams();

  if (state.search.trim()) params.set("q", state.search.trim());
  if (state.sort !== "alpha") params.set("sort", state.sort);

  if (state.selectedBankIds.length > 0) {
    params.set("banks", joinCsv(state.selectedBankIds.map(serializeBankId)));
  }

  if (state.selectedStatusIds.length === 0) {
    params.set("status", ALL_STATUSES_TOKEN);
  } else if (!idsEqual(state.selectedStatusIds, options.defaultStatusIds)) {
    params.set("status", joinCsv(state.selectedStatusIds));
  }

  if (state.selectedAccountTypeFilterIds.length > 0) {
    params.set("types", joinCsv(state.selectedAccountTypeFilterIds));
  }

  if (state.selectedFournisseurKeys.length > 0) {
    params.set("src", joinFournisseurKeys(state.selectedFournisseurKeys));
  }

  if (state.balanceBucket !== "all") params.set("bal", state.balanceBucket);

  if (
    options.balanceRangeFilterActive &&
    state.balanceRangeMin != null &&
    state.balanceRangeMax != null
  ) {
    params.set("balMin", String(state.balanceRangeMin));
    params.set("balMax", String(state.balanceRangeMax));
  }

  if (state.createdFromInput.trim()) params.set("from", state.createdFromInput.trim());
  if (state.createdToInput.trim()) params.set("to", state.createdToInput.trim());

  return params;
}

export function buildAccountsListHref(
  state: AccountsListUrlState,
  options: {
    defaultStatusIds: string[];
    balanceRangeFilterActive?: boolean;
    extraParams?: Record<string, string | null | undefined>;
  }
): string {
  const params = serializeAccountsListUrlState(state, options);
  if (options.extraParams) {
    for (const [key, value] of Object.entries(options.extraParams)) {
      if (value == null || value === "") params.delete(key);
      else params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `/accounts?${qs}` : "/accounts";
}

export function buildAccountDetailHref(
  accountId: string,
  listSearch: string,
  extraParams?: Record<string, string | null | undefined>
): string {
  const params = new URLSearchParams();
  if (listSearch.trim()) params.set("list", listSearch.trim());
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value == null || value === "") continue;
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `/accounts/${accountId}?${qs}` : `/accounts/${accountId}`;
}

export function accountsListHrefFromDetailSearchParams(searchParams: URLSearchParams): string {
  const list = searchParams.get("list")?.trim();
  return list ? `/accounts?${list}` : "/accounts";
}

export function stripReservedAccountsListParams(searchParams: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(searchParams.toString());
  for (const key of RESERVED_PARAMS) {
    params.delete(key);
  }
  return params;
}
