"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AddTransactionModal } from "@/components/AddTransactionModal";
import { GenerateInvoiceModal } from "@/components/GenerateInvoiceModal";
import { SheetFooter } from "@/components/layout/SheetFooter";
import { SheetToolbar } from "@/components/layout/SheetToolbar";
import { TransactionFilters } from "@/components/TransactionFilters";
import type { BankAccount, Transaction } from "@/lib/types";

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
  const [filterPanelOpen, setFilterPanelOpen] = useState(!!bankAccountIdFromUrl);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [selectedSum, setSelectedSum] = useState<number | null>(null);

  const [bankAccountId, setBankAccountId] = useState(bankAccountIdFromUrl);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [type, setType] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [invoiceModalTransaction, setInvoiceModalTransaction] = useState<Transaction | null>(null);
  const [zoom, setZoom] = useState(100);
  const [sortState, setSortState] = useState<{ column: string; direction: "asc" | "desc" } | null>({
    column: "transaction_date",
    direction: "desc",
  });

  const handleSortChange = useCallback((field: string) => {
    setSortState((prev) => {
      if (prev?.column === field) {
        if (prev.direction === "desc") return { column: field, direction: "asc" as const };
        return null; // asc -> reset to default
      }
      return { column: field, direction: "asc" as const };
    });
  }, []);

  const sortedTransactions = useMemo(() => {
    const effective = sortState ?? { column: "transaction_date", direction: "desc" as const };
    const dir = effective.direction === "asc" ? 1 : -1;
    const parseDate = (d: string | undefined): number =>
      d ? new Date(d).getTime() : 0;
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
        case "bank_account_name": {
          const na = a.bank_account_name ?? a.company_name ?? "";
          const nb = b.bank_account_name ?? b.company_name ?? "";
          cmp = na.localeCompare(nb);
          break;
        }
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
          cmp = new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
          break;
        default:
          return 0;
      }
      return cmp * dir;
    });
  }, [transactions, sortState]);

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

  const [totalBalance, setTotalBalance] = useState<number>(0);

  const fetchTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    try {
      const params = new URLSearchParams();
      if (bankAccountId) params.set("bank_account_id", bankAccountId);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (type) params.set("type", type);
      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      const data = await res.json();
      const txns = Array.isArray(data) ? data : data.transactions ?? [];
      const balance = typeof data.total_balance === "number" ? data.total_balance : null;
      setTransactions(txns);
      setTotalBalance(balance ?? txns.reduce((s: number, t: Transaction) => {
        const num = Number(t.amount);
        const signed = t.type === "DEBIT" ? -num : num;
        return s + (Number.isNaN(num) ? 0 : signed);
      }, 0));
    } finally {
      setLoadingTransactions(false);
    }
  }, [bankAccountId, dateFrom, dateTo, type]);

  useEffect(() => {
    fetchBankAccounts();
  }, [fetchBankAccounts]);

  useEffect(() => {
    const id = searchParams.get("bank_account_id") ?? searchParams.get("company_id") ?? "";
    setBankAccountId(id);
    setFilterPanelOpen(!!id);
  }, [searchParams]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleApplyFilters = useCallback(() => {
    fetchTransactions();
  }, [fetchTransactions]);

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
        const delta = signedAmount(newRow) - (oldRow ? signedAmount(oldRow) : 0);
        setTotalBalance((b) => Math.round((b + delta) * 100) / 100);
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

  const handleInvoiceSuccess = useCallback((invoiceId: string, _pdfUrl: string, _invoiceNumber: string) => {
    window.open(`/api/invoices/${invoiceId}/pdf`, "_blank");
    setInvoiceModalTransaction(null);
    fetchTransactions();
  }, [fetchTransactions]);

  const handleAddTransaction = useCallback((newTx: Transaction) => {
    setTransactions((prev) => [newTx, ...prev]);
    setTotalBalance((b) => Math.round((b + signedAmount(newTx)) * 100) / 100);
    setAddModalOpen(false);
    fetchTransactions();
  }, [fetchTransactions]);

  const handleDeleteTransaction = useCallback(async (id: string) => {
    setSaveStatus("saving");
    setSaveMessage("");
    const deleted = transactions.find((t) => t.id === id);
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      if (deleted) {
        setTotalBalance((b) => Math.round((b - signedAmount(deleted)) * 100) / 100);
      }
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      fetchTransactions();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setSaveStatus("error");
      setSaveMessage(err instanceof Error ? err.message : "Erreur");
    }
  }, [fetchTransactions, transactions]);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(150, z + 10));
  }, []);
  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(50, z - 10));
  }, []);

  const handleExport = useCallback(() => {
    const headers = ["ID", "Date", "Compte", "Montant", "Type", "Description", "Créé le"];
    const rows = sortedTransactions.map((t) => {
      const num = Number(t.amount);
      const signed = t.type === "DEBIT" ? -num : num;
      return [
        t.id,
        t.transaction_date,
        t.bank_account_name ?? t.company_name ?? "",
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
  }, [sortedTransactions]);

  return (
    <div className="flex min-h-screen flex-col">
      {setupSuccess && (
        <div className="mx-4 mt-4 rounded-xl border border-[var(--primary-muted-border)] bg-[var(--primary-muted)] px-4 py-3 text-sm text-[var(--primary)]">
          Compte créé. Pour créer d&apos;autres utilisateurs, assignez le rôle admin dans la Neon Console (Auth → Users → Make admin) puis allez dans Paramètres.
        </div>
      )}
      <SheetToolbar
        onFilterClick={() => setFilterPanelOpen((o) => !o)}
        onExportClick={handleExport}
        onAddClick={bankAccounts.length > 0 ? () => setAddModalOpen(true) : undefined}
        filterPanelOpen={filterPanelOpen}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex min-h-full flex-1 flex-col px-4 py-4">
          {filterPanelOpen && (
            <div className="mb-4 shrink-0">
              <TransactionFilters
                bankAccounts={bankAccounts}
                bankAccountId={bankAccountId}
                dateFrom={dateFrom}
                dateTo={dateTo}
                type={type}
                onBankAccountIdChange={setBankAccountId}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
                onTypeChange={setType}
                onApply={handleApplyFilters}
                loading={loadingBankAccounts}
              />
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col">
            <TransactionsGrid
              transactions={sortedTransactions}
              loading={loadingTransactions}
              zoom={zoom}
              onCellValueChanged={handleCellValueChanged}
              onSelectionSumChange={setSelectedSum}
              onDelete={handleDeleteTransaction}
              onGenerateInvoice={(txn) => setInvoiceModalTransaction(txn)}
              onSortChange={handleSortChange}
              sortState={sortState ?? { column: "transaction_date", direction: "desc" }}
            />
          </div>
        </div>
      </div>
      {addModalOpen && (
        <AddTransactionModal
          bankAccounts={bankAccounts}
          defaultBankAccountId={bankAccountId || undefined}
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
        totalCount={transactions.length}
        saveStatus={saveStatus}
        saveMessage={saveMessage}
        selectedSum={selectedSum}
        totalBalance={totalBalance}
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
