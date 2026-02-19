"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { SheetFooter } from "@/components/layout/SheetFooter";
import { SheetToolbar } from "@/components/layout/SheetToolbar";
import { TransactionFilters } from "@/components/TransactionFilters";
import type { Company, Transaction } from "@/lib/types";

const TransactionsGrid = dynamic(
  () => import("@/components/TransactionsGrid").then((m) => ({ default: m.TransactionsGrid })),
  { ssr: false, loading: () => <div className="flex min-h-[400px] items-center justify-center text-[var(--muted-foreground)]">Chargement du tableau…</div> }
);

function HomeContent() {
  const searchParams = useSearchParams();
  const companyIdFromUrl = searchParams.get("company_id") ?? "";

  const [companies, setCompanies] = useState<Company[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [filterPanelOpen, setFilterPanelOpen] = useState(!!companyIdFromUrl);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [selectedSum, setSelectedSum] = useState<number | null>(null);

  const [companyId, setCompanyId] = useState(companyIdFromUrl);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [type, setType] = useState("");

  const fetchCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const res = await fetch("/api/companies");
      if (!res.ok) throw new Error("Failed to fetch companies");
      const data = await res.json();
      setCompanies(data);
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    try {
      const params = new URLSearchParams();
      if (companyId) params.set("company_id", companyId);
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
  }, [companyId, dateFrom, dateTo, type]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    const id = searchParams.get("company_id") ?? "";
    setCompanyId(id);
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

  const handleExport = useCallback(() => {
    const headers = ["ID", "Date", "Société", "Montant", "Type", "Description", "Créé le"];
    const rows = transactions.map((t) => [
      t.id,
      t.transaction_date,
      t.company_name ?? "",
      t.amount,
      t.type,
      t.description ?? "",
      t.created_at ?? "",
    ]);
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
      <SheetToolbar
        onFilterClick={() => setFilterPanelOpen((o) => !o)}
        onExportClick={handleExport}
        filterPanelOpen={filterPanelOpen}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex min-h-full flex-1 flex-col px-4 py-4">
          {filterPanelOpen && (
            <div className="mb-4 shrink-0">
              <TransactionFilters
                companies={companies}
                companyId={companyId}
                dateFrom={dateFrom}
                dateTo={dateTo}
                type={type}
                onCompanyIdChange={setCompanyId}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
                onTypeChange={setType}
                onApply={handleApplyFilters}
                loading={loadingCompanies}
              />
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col">
            <TransactionsGrid
              transactions={transactions}
              loading={loadingTransactions}
              onCellValueChanged={handleCellValueChanged}
              onSelectionSumChange={setSelectedSum}
            />
          </div>
        </div>
      </div>
      <SheetFooter
        totalCount={transactions.length}
        saveStatus={saveStatus}
        saveMessage={saveMessage}
        selectedSum={selectedSum}
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
