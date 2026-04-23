"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InternalCreditPairModal } from "@/components/InternalCreditPairModal";
import { AddTransactionModal } from "@/components/AddTransactionModal";
import { ImportBankStatementModal } from "@/components/ImportBankStatementModal";
import { GenerateInvoiceModal } from "@/components/GenerateInvoiceModal";
import { SheetFooter } from "@/components/layout/SheetFooter";
import { SheetToolbar } from "@/components/layout/SheetToolbar";
import { TransactionsSummaryPanel } from "@/components/layout/TransactionsSummaryPanel";
import type { TransactionSelectionStats } from "@/components/TransactionsGrid";
import { debitStatusLabel } from "@/lib/debit-status";
import type { AccountType, BankAccount, Fournisseur, Transaction } from "@/lib/types";
import {
  groupedInvoiceDisabledReason,
  singleInvoiceDisabledReason,
} from "@/lib/grouped-invoice-selection";
import { DEFAULT_TRANSACTION_TABLE_SORT } from "@/lib/transaction-sort";
import { isCreditLikeType, transactionTypeLabel } from "@/lib/transaction-type";
import {
  applyClientTransactionFilters,
  DEFAULT_TRANSACTION_FILTERS,
  filtersToApiParams,
  getAccountStatusFilterKeys,
  getAllBankIdsForFilter,
  getBankNameFilterKeys,
  getCompanyFilterKeys,
  getProcessedByFilterKeys,
  hasActiveTransactionFilters,
  normalizeTransactionFilters,
  type TransactionFilterValues,
} from "@/lib/transaction-filters";

/** Page size for GET /api/transactions (API max 1000 per request). */
const TRANSACTION_PAGE_SIZE = 500;

const TransactionsGrid = dynamic(
  () => import("@/components/TransactionsGrid").then((m) => ({ default: m.TransactionsGrid })),
  { ssr: false, loading: () => <div className="flex min-h-[400px] items-center justify-center text-[var(--muted-foreground)]">Chargement du tableau…</div> }
);

function signedAmount(t: Transaction): number {
  const num = Number(t.amount);
  return Number.isNaN(num) ? 0 : t.type === "DEBIT" ? -num : num;
}

/** Jour courant en fuseau local (YYYY-MM-DD). */
function localTodayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Jour calendaire d’une transaction, aligné sur « aujourd’hui » local.
 * - Si l’API envoie uniquement `YYYY-MM-DD`, on garde telle quelle (jour comptable).
 * - Si c’est un instant ISO (avec T / Z), on prend année-mois-jour dans le fuseau du navigateur.
 */
function transactionCalendarDayLocal(transactionDate: string | undefined | null): string {
  if (transactionDate == null) return "";
  const s = String(transactionDate).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1]! : "";
  }
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function HomeContent() {
  const searchParams = useSearchParams();
  const bankAccountIdFromUrl = searchParams.get("bank_account_id") ?? searchParams.get("company_id") ?? "";
  const setupSuccess = searchParams.get("setup") === "1";

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [settingsClients, setSettingsClients] = useState<AccountType[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingBankAccounts, setLoadingBankAccounts] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [loadingMoreTransactions, setLoadingMoreTransactions] = useState(false);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const transactionsLengthRef = useRef(0);
  /** Bumps when the list is reset (filters / refetch) so stale load-more responses are ignored. */
  const transactionsListEpochRef = useRef(0);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [selectionStats, setSelectionStats] = useState<TransactionSelectionStats | null>(null);
  const [transactionGridSelectionResetNonce, setTransactionGridSelectionResetNonce] = useState(0);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);

  const [filterValues, setFilterValues] = useState<TransactionFilterValues>(() => ({
    ...DEFAULT_TRANSACTION_FILTERS,
    bankFilter: bankAccountIdFromUrl
      ? { mode: "include", ids: [bankAccountIdFromUrl] }
      : { mode: "all" },
  }));
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importStatementModalOpen, setImportStatementModalOpen] = useState(false);
  const [invoiceModalTransactions, setInvoiceModalTransactions] = useState<Transaction[] | null>(null);
  const [internalCreditModalTxn, setInternalCreditModalTxn] = useState<Transaction | null>(null);
  const [zoom, setZoom] = useState(100);
  const [sortState, setSortState] = useState<{
    column: string;
    direction: "asc" | "desc";
  } | null>(() => ({ ...DEFAULT_TRANSACTION_TABLE_SORT }));

  const handleSortDirect = useCallback((field: string, direction: "asc" | "desc") => {
    setSortState({ column: field, direction });
  }, []);

  const handleSortDefault = useCallback(() => {
    setSortState({ ...DEFAULT_TRANSACTION_TABLE_SORT });
  }, []);

  const sortedTransactions = useMemo(() => {
    const effective = sortState ?? DEFAULT_TRANSACTION_TABLE_SORT;
    const dir = effective.direction === "asc" ? 1 : -1;
    const parseDate = (d: string | undefined | null): number => {
      if (d == null || (typeof d === "string" && d.trim() === "")) return 0;
      const t = new Date(d).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    return [...transactions].sort((a, b) => {
      let cmp = 0;
      switch (effective.column) {
        case "id":
          cmp = (a.id ?? "").localeCompare(b.id ?? "");
          break;
        case "transaction_date":
          cmp = parseDate(a.transaction_date) - parseDate(b.transaction_date);
          if (cmp === 0) cmp = parseDate(a.created_at) - parseDate(b.created_at);
          break;
        case "account_status_name":
          cmp = (a.account_status_name ?? "").localeCompare(b.account_status_name ?? "");
          if (cmp === 0) {
            cmp = (a.account_status_emoji ?? "").localeCompare(b.account_status_emoji ?? "");
          }
          break;
        case "bank_name":
          cmp = (a.bank_name ?? "").localeCompare(b.bank_name ?? "");
          break;
        case "company_name":
          cmp = (a.company_name ?? "").localeCompare(b.company_name ?? "");
          break;
        case "amount": {
          const na = Number(a.amount);
          const nb = Number(b.amount);
          const sa = a.type === "DEBIT" ? -na : na;
          const sb = b.type === "DEBIT" ? -nb : nb;
          cmp = sa - sb;
          break;
        }
        case "type": {
          const rank = (x: Transaction) =>
            x.type === "DEBIT" ? 0 : x.type === "CREDIT" ? 1 : x.type === "INTERNAL_CREDIT" ? 2 : 3;
          cmp = rank(a) - rank(b);
          if (cmp === 0) cmp = (a.type ?? "").localeCompare(b.type ?? "");
          break;
        }
        case "debit_status": {
          const key = (t: Transaction) =>
            t.type === "DEBIT" ? (t.debit_status ?? "") : "\uFFFF";
          cmp = key(a).localeCompare(key(b), "fr");
          break;
        }
        case "description":
          cmp = (a.description ?? "").localeCompare(b.description ?? "");
          break;
        case "client_name":
          cmp = (a.client_name ?? "").localeCompare(b.client_name ?? "");
          break;
        case "created_at":
          cmp = parseDate(a.created_at) - parseDate(b.created_at);
          break;
        case "processed_by_user_name":
          cmp = (a.processed_by_user_name ?? "").localeCompare(b.processed_by_user_name ?? "");
          break;
        default:
          return 0;
      }
      return cmp * dir;
    });
  }, [transactions, sortState]);

  const filteredTransactions = useMemo(
    () => applyClientTransactionFilters(sortedTransactions, filterValues),
    [sortedTransactions, filterValues]
  );

  const filtersNarrowingView = useMemo(
    () => hasActiveTransactionFilters(filterValues),
    [filterValues]
  );

  /**
   * Totaux du bandeau : sans filtre → uniquement les transactions à la date du jour ;
   * avec filtre → toutes les lignes visibles (ex. plage de dates), pas limité à « aujourd’hui ».
   */
  const transactionsForSummaryTotals = useMemo(() => {
    if (filtersNarrowingView) {
      return filteredTransactions;
    }
    const today = localTodayISO();
    return filteredTransactions.filter(
      (t) => transactionCalendarDayLocal(t.transaction_date) === today
    );
  }, [filtersNarrowingView, filteredTransactions]);

  const selectedTransactionsFromGrid = useMemo(() => {
    const ids = selectionStats?.selectedTransactionIds;
    if (!ids?.length) return [];
    const byId = new Map(filteredTransactions.map((t) => [t.id, t]));
    return ids.map((id) => byId.get(id)).filter((t): t is Transaction => t != null);
  }, [selectionStats, filteredTransactions]);

  const summaryNetTotal = useMemo(() => {
    return transactionsForSummaryTotals.reduce((sum, t) => sum + signedAmount(t), 0);
  }, [transactionsForSummaryTotals]);

  const { summaryDebitsTotal, summaryCreditsTotal } = useMemo(() => {
    let debits = 0;
    let credits = 0;
    for (const t of transactionsForSummaryTotals) {
      const num = Number(t.amount);
      if (Number.isNaN(num)) continue;
      if (t.type === "DEBIT") debits += num;
      else if (isCreditLikeType(t.type)) credits += num;
    }
    return { summaryDebitsTotal: debits, summaryCreditsTotal: credits };
  }, [transactionsForSummaryTotals]);

  const fetchBankAccounts = useCallback(async () => {
    setLoadingBankAccounts(true);
    try {
      const res = await fetch("/api/bank-accounts");
      if (!res.ok) throw new Error("Failed to fetch bank accounts");
      const data = await res.json();
      setBankAccounts(data);
    } finally {
      setLoadingBankAccounts(false);
    }
  }, []);

  const fetchFournisseurs = useCallback(async () => {
    try {
      const res = await fetch("/api/fournisseurs");
      if (!res.ok) return;
      const data = await res.json();
      setFournisseurs(Array.isArray(data) ? data : []);
    } catch {
      /* liste optionnelle pour le tableau */
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    transactionsListEpochRef.current += 1;
    const epoch = transactionsListEpochRef.current;
    setLoadingTransactions(true);
    setHasMoreTransactions(false);
    try {
      const api = filtersToApiParams(filterValues);
      const params = new URLSearchParams();
      if (api.bank_account_id) params.set("bank_account_id", api.bank_account_id);
      if (api.date_from) params.set("date_from", api.date_from);
      if (api.date_to) params.set("date_to", api.date_to);
      if (api.type) params.set("type", api.type);
      params.set("limit", String(TRANSACTION_PAGE_SIZE));
      params.set("offset", "0");
      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      const data = await res.json();
      const txns = Array.isArray(data) ? data : data.transactions ?? [];
      if (transactionsListEpochRef.current !== epoch) return;
      setTransactions(txns);
      setHasMoreTransactions(
        typeof data.has_more === "boolean" ? data.has_more : txns.length >= TRANSACTION_PAGE_SIZE
      );
    } finally {
      if (transactionsListEpochRef.current === epoch) {
        setLoadingTransactions(false);
      }
    }
  }, [filterValues]);

  const loadMoreTransactions = useCallback(async () => {
    if (!hasMoreTransactions || loadingMoreTransactions || loadingTransactions) return;
    const epoch = transactionsListEpochRef.current;
    const offset = transactionsLengthRef.current;
    setLoadingMoreTransactions(true);
    try {
      const api = filtersToApiParams(filterValues);
      const params = new URLSearchParams();
      if (api.bank_account_id) params.set("bank_account_id", api.bank_account_id);
      if (api.date_from) params.set("date_from", api.date_from);
      if (api.date_to) params.set("date_to", api.date_to);
      if (api.type) params.set("type", api.type);
      params.set("limit", String(TRANSACTION_PAGE_SIZE));
      params.set("offset", String(offset));
      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      const data = await res.json();
      const batch = Array.isArray(data) ? data : data.transactions ?? [];
      if (transactionsListEpochRef.current !== epoch) return;
      setHasMoreTransactions(
        typeof data.has_more === "boolean" ? data.has_more : batch.length >= TRANSACTION_PAGE_SIZE
      );
      setTransactions((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        const merged = [...prev];
        for (const t of batch) {
          if (t?.id && !seen.has(t.id)) {
            seen.add(t.id);
            merged.push(t);
          }
        }
        return merged;
      });
    } catch (e) {
      console.error(e);
    } finally {
      if (transactionsListEpochRef.current === epoch) {
        setLoadingMoreTransactions(false);
      }
    }
  }, [
    filterValues,
    hasMoreTransactions,
    loadingMoreTransactions,
    loadingTransactions,
  ]);

  useEffect(() => {
    transactionsLengthRef.current = transactions.length;
  }, [transactions.length]);

  useEffect(() => {
    fetchBankAccounts();
  }, [fetchBankAccounts]);

  useEffect(() => {
    fetchFournisseurs();
  }, [fetchFournisseurs]);

  const fetchSettingsClients = useCallback(async () => {
    try {
      const res = await fetch("/api/account-types");
      if (!res.ok) return;
      const data = await res.json();
      setSettingsClients(Array.isArray(data) ? data : []);
    } catch {
      /* optionnel pour le tableau */
    }
  }, []);

  useEffect(() => {
    fetchSettingsClients();
  }, [fetchSettingsClients]);

  useEffect(() => {
    const id = searchParams.get("bank_account_id") ?? searchParams.get("company_id") ?? "";
    setFilterValues((prev) => ({
      ...prev,
      bankFilter: id ? { mode: "include", ids: [id] } : { mode: "all" },
    }));
  }, [searchParams]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleApplyFilters = useCallback(
    (next: TransactionFilterValues) => {
      const allBankIds = getAllBankIdsForFilter(transactions, bankAccounts);
      const allBankNameKeys = getBankNameFilterKeys(transactions);
      const allAccountStatusKeys = getAccountStatusFilterKeys(transactions);
      const allProcessedKeys = getProcessedByFilterKeys(transactions);
      const allCompanyKeys = getCompanyFilterKeys(transactions);
      setFilterValues(
        normalizeTransactionFilters(next, {
          allBankIds,
          allBankNameKeys,
          allAccountStatusKeys,
          allProcessedKeys,
          allCompanyKeys,
        })
      );
    },
    [transactions, bankAccounts]
  );

  const handleResetFilters = useCallback(() => {
    setFilterValues(DEFAULT_TRANSACTION_FILTERS);
  }, []);

  const handleQuickCreateFournisseur = useCallback(async (): Promise<Fournisseur | null> => {
    const name = window.prompt("Nom du nouveau fournisseur :");
    if (name == null) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    try {
      const res = await fetch("/api/fournisseurs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, sort_order: fournisseurs.length }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<Fournisseur>;
      if (!res.ok) {
        window.alert(typeof data.error === "string" ? data.error : `Erreur HTTP ${res.status}`);
        return null;
      }
      if (!data.id || !data.name) {
        window.alert("Réponse serveur inattendue.");
        return null;
      }
      await fetchFournisseurs();
      return data as Fournisseur;
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erreur réseau.");
      return null;
    }
  }, [fournisseurs.length, fetchFournisseurs]);

  const handleQuickCreateSettingsClient = useCallback(async (): Promise<AccountType | null> => {
    const name = window.prompt("Nom du nouveau client :");
    if (name == null) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    try {
      const res = await fetch("/api/account-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, sort_order: settingsClients.length }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<AccountType>;
      if (!res.ok) {
        window.alert(typeof data.error === "string" ? data.error : `Erreur HTTP ${res.status}`);
        return null;
      }
      if (!data.id || !data.name) {
        window.alert("Réponse serveur inattendue.");
        return null;
      }
      await fetchSettingsClients();
      return data as AccountType;
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erreur réseau.");
      return null;
    }
  }, [settingsClients.length, fetchSettingsClients]);

  const handleCellValueChanged = useCallback(
    async (id: string, field: string, value: unknown) => {
      const body: Record<string, unknown> = { [field]: value };
      if (field === "amount") body.amount = Number(value);
      if (field === "fournisseur_id") body.fournisseur_id = value === "" ? null : value;
      if (field === "client_account_type_id")
        body.client_account_type_id = value === "" || value == null ? null : value;
      if (field === "debit_status")
        body.debit_status = value === "" || value == null ? null : value;
      setSaveStatus("saving");
      setSaveMessage("");
      try {
        const res = await fetch(`/api/transactions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const updated = await res.json();
        const oldRow = transactions.find((r) => r.id === id);
        const newRow = oldRow ? { ...oldRow, ...updated } : updated;
        setTransactions((prev) =>
          prev.map((row) => (row.id === id ? newRow : row))
        );
        fetchTransactions();
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (err) {
        setSaveStatus("error");
        setSaveMessage(err instanceof Error ? err.message : "Erreur");
      }
    },
    [fetchTransactions, transactions]
  );

  const handleInvoiceSuccess = useCallback((invoiceId: string) => {
    window.open(`/api/invoices/${invoiceId}/pdf`, "_blank");
    setInvoiceModalTransactions(null);
    fetchTransactions();
  }, [fetchTransactions]);

  const handleCreateGroupedInvoice = useCallback((txns: Transaction[]) => {
    setInvoiceModalTransactions(txns);
  }, []);

  const createInvoiceToolbar = useMemo(() => {
    const st = selectionStats;
    const ids = st?.selectedTransactionIds;
    if (!st || !ids || ids.length !== 1) return undefined;
    const reason = singleInvoiceDisabledReason(st, selectedTransactionsFromGrid);
    return {
      count: 1,
      disabled: Boolean(reason),
      disabledReason: reason,
      onClick: () => handleCreateGroupedInvoice(selectedTransactionsFromGrid),
    };
  }, [selectionStats, selectedTransactionsFromGrid, handleCreateGroupedInvoice]);

  const groupedInvoiceToolbar = useMemo(() => {
    const st = selectionStats;
    const ids = st?.selectedTransactionIds;
    if (!st || !ids || ids.length < 2) return undefined;
    const reason = groupedInvoiceDisabledReason(st, selectedTransactionsFromGrid);
    return {
      count: ids.length,
      disabled: Boolean(reason),
      disabledReason: reason,
      onClick: () => handleCreateGroupedInvoice(selectedTransactionsFromGrid),
    };
  }, [selectionStats, selectedTransactionsFromGrid, handleCreateGroupedInvoice]);

  const handleAddTransaction = useCallback((newTx: Transaction) => {
    setTransactions((prev) => [newTx, ...prev]);
    setAddModalOpen(false);
    fetchTransactions();
  }, [fetchTransactions]);

  const handleBeginInternalCreditPair = useCallback(
    (creditId: string) => {
      const t = transactions.find((x) => x.id === creditId);
      if (t?.type === "CREDIT") {
        setInternalCreditModalTxn(t);
      }
    },
    [transactions]
  );

  const handleImportStatementSuccess = useCallback(
    (insertedCount: number) => {
      setImportStatementModalOpen(false);
      if (insertedCount > 0) {
        setSaveStatus("saved");
        setSaveMessage(
          insertedCount === 1
            ? "1 transaction importée."
            : `${insertedCount} transactions importées.`
        );
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
      fetchTransactions();
    },
    [fetchTransactions]
  );

  const handleDeleteTransaction = useCallback(async (id: string) => {
    setSaveStatus("saving");
    setSaveMessage("");
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      fetchTransactions();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setSaveStatus("error");
      setSaveMessage(err instanceof Error ? err.message : "Erreur");
    }
  }, [fetchTransactions]);

  const handleBulkDeleteSelected = useCallback(async () => {
    const ids = selectionStats?.selectedTransactionIds;
    if (!ids?.length) return;
    const unique = [...new Set(ids)];
    const n = unique.length;
    if (!confirm(`Supprimer ${n} transaction${n > 1 ? "s" : ""} ?`)) return;
    setBulkDeleteBusy(true);
    setSaveStatus("saving");
    setSaveMessage("");
    try {
      for (const id of unique) {
        const res = await fetch(`/api/transactions/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        setTransactions((prev) => prev.filter((t) => t.id !== id));
      }
      setTransactionGridSelectionResetNonce((x) => x + 1);
      await fetchTransactions();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      await fetchTransactions();
      setSaveStatus("error");
      setSaveMessage(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBulkDeleteBusy(false);
    }
  }, [selectionStats, fetchTransactions]);

  const bulkDeleteToolbar = useMemo(() => {
    const ids = selectionStats?.selectedTransactionIds;
    if (!ids?.length) return null;
    const unique = [...new Set(ids)];
    return {
      count: unique.length,
      busy: bulkDeleteBusy,
      onClick: handleBulkDeleteSelected,
    };
  }, [selectionStats, bulkDeleteBusy, handleBulkDeleteSelected]);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(150, z + 10));
  }, []);
  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(50, z - 10));
  }, []);

  const handleExport = useCallback(() => {
    const headers = [
      "ID",
      "Date",
      "Compte",
      "Statut du compte",
      "Banque",
      "Société",
      "Montant",
      "Type",
      "Description",
      "Fournisseur",
      "Client",
      "Créé le",
      "État",
    ];
    const rows = filteredTransactions.map((t) => {
      const num = Number(t.amount);
      const signed = t.type === "DEBIT" ? -num : num;
      const statusDisplay = [t.account_status_emoji, t.account_status_name].filter(Boolean).join(" ").trim();
      const etat =
        t.type === "DEBIT" ? debitStatusLabel(t.debit_status ?? null) || "—" : "";
      return [
        t.id,
        t.transaction_date,
        t.bank_account_name ?? "",
        statusDisplay,
        t.bank_name ?? "",
        t.company_name ?? "",
        signed,
        transactionTypeLabel(t.type),
        t.description ?? "",
        t.fournisseur_name ?? "",
        t.client_name ?? "",
        t.created_at ?? "",
        etat,
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredTransactions]);

  return (
    <div className="flex min-h-screen flex-col">
      {setupSuccess && (
        <div className="mx-4 mt-4 rounded-xl border border-[var(--primary-muted-border)] bg-[var(--primary-muted)] px-4 py-3 text-sm text-[var(--primary)]">
          Compte créé. Pour créer d&apos;autres utilisateurs, assignez le rôle admin dans la Neon Console (Auth → Users → Make admin) puis allez dans Paramètres.
        </div>
      )}
      <TransactionsSummaryPanel
        summaryNetTotal={summaryNetTotal}
        summaryDebitsTotal={summaryDebitsTotal}
        summaryCreditsTotal={summaryCreditsTotal}
        filtersNarrowingView={filtersNarrowingView}
        selectionStats={selectionStats}
      />
      <SheetToolbar
        onResetFiltersClick={handleResetFilters}
        onExportClick={handleExport}
        onAddClick={
          bankAccounts.length > 0 && !loadingBankAccounts ? () => setAddModalOpen(true) : undefined
        }
        onImportStatementClick={
          bankAccounts.length > 0 && !loadingBankAccounts
            ? () => setImportStatementModalOpen(true)
            : undefined
        }
        createInvoice={createInvoiceToolbar}
        groupedInvoice={groupedInvoiceToolbar}
        bulkDeleteSelected={bulkDeleteToolbar}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex min-h-full flex-1 flex-col px-4 py-4">
          <div className="flex min-h-0 flex-1 flex-col">
            <TransactionsGrid
              transactions={filteredTransactions}
              loading={loadingTransactions}
              loadingMore={loadingMoreTransactions}
              hasMore={hasMoreTransactions}
              onLoadMore={loadMoreTransactions}
              zoom={zoom}
              onCellValueChanged={handleCellValueChanged}
              onSelectionStatsChange={setSelectionStats}
              onDelete={handleDeleteTransaction}
              onSortDirect={handleSortDirect}
              onSortDefault={handleSortDefault}
              sortState={sortState ?? DEFAULT_TRANSACTION_TABLE_SORT}
              filterValues={filterValues}
              onApplyFilters={handleApplyFilters}
              bankAccounts={bankAccounts}
              transactionsForFilterOptions={sortedTransactions}
              fournisseurs={fournisseurs}
              settingsClients={settingsClients}
              onQuickCreateFournisseur={handleQuickCreateFournisseur}
              onQuickCreateSettingsClient={handleQuickCreateSettingsClient}
              selectionResetNonce={transactionGridSelectionResetNonce}
              onBeginInternalCreditPair={handleBeginInternalCreditPair}
            />
          </div>
        </div>
      </div>
      {addModalOpen && (
        <AddTransactionModal
          bankAccounts={bankAccounts}
          defaultBankAccountId={
            filterValues.bankFilter.mode === "include" && filterValues.bankFilter.ids.length === 1
              ? filterValues.bankFilter.ids[0]
              : undefined
          }
          onClose={() => setAddModalOpen(false)}
          onSuccess={handleAddTransaction}
        />
      )}
      {importStatementModalOpen && (
        <ImportBankStatementModal
          bankAccounts={bankAccounts}
          defaultBankAccountId={
            filterValues.bankFilter.mode === "include" && filterValues.bankFilter.ids.length === 1
              ? filterValues.bankFilter.ids[0]
              : undefined
          }
          onClose={() => setImportStatementModalOpen(false)}
          onSuccess={handleImportStatementSuccess}
        />
      )}
      {invoiceModalTransactions && invoiceModalTransactions.length > 0 && (
        <GenerateInvoiceModal
          key={invoiceModalTransactions.map((t) => t.id).join(",")}
          transactions={invoiceModalTransactions}
          onClose={() => setInvoiceModalTransactions(null)}
          onSuccess={handleInvoiceSuccess}
        />
      )}
      {internalCreditModalTxn && (
        <InternalCreditPairModal
          credit={internalCreditModalTxn}
          fournisseurs={fournisseurs}
          onQuickCreateFournisseur={handleQuickCreateFournisseur}
          onClose={() => setInternalCreditModalTxn(null)}
          onPaired={() => void fetchTransactions()}
        />
      )}
      <SheetFooter
        saveStatus={saveStatus}
        saveMessage={saveMessage}
        visibleTransactionCount={filteredTransactions.length}
        selectionRowsLabel={
          selectionStats
            ? selectionStats.selectedTransactionIds.length > 0
              ? "Lignes cochées"
              : "Lignes avec montant dans la sélection"
            : undefined
        }
        selectionRowsCount={selectionStats?.rowCount}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-[var(--muted-foreground)]">Chargement…</div>}>
      <HomeContent />
    </Suspense>
  );
}
