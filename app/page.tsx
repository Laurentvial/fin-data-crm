"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AddTransactionModal } from "@/components/AddTransactionModal";
import { GenerateInvoiceModal } from "@/components/GenerateInvoiceModal";
import { SheetFooter } from "@/components/layout/SheetFooter";
import { SheetToolbar } from "@/components/layout/SheetToolbar";
import type { BankAccount, Transaction } from "@/lib/types";
import { DEFAULT_TRANSACTION_TABLE_SORT } from "@/lib/transaction-sort";
import {
  applyClientTransactionFilters,
  DEFAULT_TRANSACTION_FILTERS,
  filtersToApiParams,
  getAllBankIdsForFilter,
  getCompanyFilterKeys,
  getProcessedByFilterKeys,
  normalizeTransactionFilters,
  type TransactionFilterValues,
} from "@/lib/transaction-filters";

const TransactionsGrid = dynamic(
  () => import("@/components/TransactionsGrid").then((m) => ({ default: m.TransactionsGrid })),
  { ssr: false, loading: () => <div className="flex min-h-[400px] items-center justify-center text-[var(--muted-foreground)]">Chargement du tableau…</div> }
);

function signedAmount(t: Transaction): number {
  const num = Number(t.amount);
  return (Number.isNaN(num) ? 0 : t.type === "DEBIT" ? -num : num);
}

function HomeContent() {
  const searchParams = useSearchParams();
  const bankAccountIdFromUrl = searchParams.get("bank_account_id") ?? searchParams.get("company_id") ?? "";
  const setupSuccess = searchParams.get("setup") === "1";

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingBankAccounts, setLoadingBankAccounts] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [selectedSum, setSelectedSum] = useState<number | null>(null);

  const [filterValues, setFilterValues] = useState<TransactionFilterValues>(() => ({
    ...DEFAULT_TRANSACTION_FILTERS,
    bankFilter: bankAccountIdFromUrl
      ? { mode: "include", ids: [bankAccountIdFromUrl] }
      : { mode: "all" },
  }));
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [invoiceModalTransaction, setInvoiceModalTransaction] = useState<Transaction | null>(null);
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
        case "bank_account_name":
          cmp = (a.bank_account_name ?? "").localeCompare(b.bank_account_name ?? "");
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
        case "type":
          cmp = (a.type === "DEBIT" ? 0 : 1) - (b.type === "DEBIT" ? 0 : 1);
          break;
        case "description":
          cmp = (a.description ?? "").localeCompare(b.description ?? "");
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

  const filteredBalance = useMemo(() => {
    return filteredTransactions.reduce((sum, t) => sum + signedAmount(t), 0);
  }, [filteredTransactions]);

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

  const fetchTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    try {
      const api = filtersToApiParams(filterValues);
      const params = new URLSearchParams();
      if (api.bank_account_id) params.set("bank_account_id", api.bank_account_id);
      if (api.date_from) params.set("date_from", api.date_from);
      if (api.date_to) params.set("date_to", api.date_to);
      if (api.type) params.set("type", api.type);
      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      const data = await res.json();
      const txns = Array.isArray(data) ? data : data.transactions ?? [];
      setTransactions(txns);
    } finally {
      setLoadingTransactions(false);
    }
  }, [filterValues]);

  useEffect(() => {
    fetchBankAccounts();
  }, [fetchBankAccounts]);

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
      const allProcessedKeys = getProcessedByFilterKeys(transactions);
      const allCompanyKeys = getCompanyFilterKeys(transactions);
      setFilterValues(
        normalizeTransactionFilters(next, { allBankIds, allProcessedKeys, allCompanyKeys })
      );
    },
    [transactions, bankAccounts]
  );

  const handleResetFilters = useCallback(() => {
    setFilterValues(DEFAULT_TRANSACTION_FILTERS);
  }, []);

  const handleCellValueChanged = useCallback(
    async (id: string, field: string, value: unknown) => {
      const body: Record<string, unknown> = { [field]: value };
      if (field === "amount") body.amount = Number(value);
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
    setInvoiceModalTransaction(null);
    fetchTransactions();
  }, [fetchTransactions]);

  const handleAddTransaction = useCallback((newTx: Transaction) => {
    setTransactions((prev) => [newTx, ...prev]);
    setAddModalOpen(false);
    fetchTransactions();
  }, [fetchTransactions]);

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

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(150, z + 10));
  }, []);
  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(50, z - 10));
  }, []);

  const handleExport = useCallback(() => {
    const headers = ["ID", "Date", "Compte", "Société", "Montant", "Type", "Description", "Créé le"];
    const rows = filteredTransactions.map((t) => {
      const num = Number(t.amount);
      const signed = t.type === "DEBIT" ? -num : num;
      return [
        t.id,
        t.transaction_date,
        t.bank_account_name ?? "",
        t.company_name ?? "",
        signed,
        t.type,
        t.description ?? "",
        t.created_at ?? "",
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
      <SheetToolbar
        onResetFiltersClick={handleResetFilters}
        onExportClick={handleExport}
        onAddClick={
          bankAccounts.length > 0 && !loadingBankAccounts ? () => setAddModalOpen(true) : undefined
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex min-h-full flex-1 flex-col px-4 py-4">
          <div className="flex min-h-0 flex-1 flex-col">
            <TransactionsGrid
              transactions={filteredTransactions}
              loading={loadingTransactions}
              zoom={zoom}
              onCellValueChanged={handleCellValueChanged}
              onSelectionSumChange={setSelectedSum}
              onDelete={handleDeleteTransaction}
              onGenerateInvoice={(txn) => setInvoiceModalTransaction(txn)}
              onSortDirect={handleSortDirect}
              onSortDefault={handleSortDefault}
              sortState={sortState ?? DEFAULT_TRANSACTION_TABLE_SORT}
              filterValues={filterValues}
              onApplyFilters={handleApplyFilters}
              bankAccounts={bankAccounts}
              transactionsForFilterOptions={sortedTransactions}
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
      {invoiceModalTransaction && (
        <GenerateInvoiceModal
          transaction={invoiceModalTransaction}
          onClose={() => setInvoiceModalTransaction(null)}
          onSuccess={handleInvoiceSuccess}
        />
      )}
      <SheetFooter
        totalCount={filteredTransactions.length}
        saveStatus={saveStatus}
        saveMessage={saveMessage}
        selectedSum={selectedSum}
        totalBalance={filteredBalance}
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
