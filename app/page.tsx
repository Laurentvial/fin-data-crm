"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AddTransactionModal } from "@/components/AddTransactionModal";
import { SheetFooter } from "@/components/layout/SheetFooter";
import { SheetToolbar } from "@/components/layout/SheetToolbar";
import { TransactionFilters } from "@/components/TransactionFilters";
import type { BankAccount, Transaction } from "@/lib/types";

const TransactionsGrid = dynamic(
  () => import("@/components/TransactionsGrid").then((m) => ({ default: m.TransactionsGrid })),
  { ssr: false, loading: () => <div className="flex min-h-[400px] items-center justify-center text-[var(--muted-foreground)]">Chargement du tableau…</div> }
);

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
  const [zoom, setZoom] = useState(100);

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
      const params = new URLSearchParams();
      if (bankAccountId) params.set("bank_account_id", bankAccountId);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (type) params.set("type", type);
      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      const data = await res.json();
      setTransactions(data);
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
        setTransactions((prev) =>
          prev.map((row) => (row.id === id ? { ...row, ...updated } : row))
        );
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (err) {
        setSaveStatus("error");
        setSaveMessage(err instanceof Error ? err.message : "Erreur");
      }
    },
    []
  );

  const handleAddTransaction = useCallback((newTx: Transaction) => {
    setTransactions((prev) => [newTx, ...prev]);
    setAddModalOpen(false);
  }, []);

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
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setSaveStatus("error");
      setSaveMessage(err instanceof Error ? err.message : "Erreur");
    }
  }, []);

  const totalBalance = transactions.reduce((sum, t) => {
    const num = Number(t.amount);
    const signed = t.type === "DEBIT" ? -Math.abs(num) : num;
    return sum + (Number.isNaN(num) ? 0 : signed);
  }, 0);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(150, z + 10));
  }, []);
  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(50, z - 10));
  }, []);

  const handleExport = useCallback(() => {
    const headers = ["ID", "Date", "Compte", "Montant", "Type", "Description", "Créé le"];
    const rows = transactions.map((t) => {
      const num = Number(t.amount);
      const signed = t.type === "DEBIT" ? -Math.abs(num) : num;
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
  }, [transactions]);

  return (
    <div className="flex min-h-screen flex-col">
      {setupSuccess && (
        <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
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
              transactions={transactions}
              loading={loadingTransactions}
              zoom={zoom}
              onCellValueChanged={handleCellValueChanged}
              onSelectionSumChange={setSelectedSum}
              onDelete={handleDeleteTransaction}
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
