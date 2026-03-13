"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AccountVignette } from "@/components/AccountVignette";
import type { BankAccount, Transaction } from "@/lib/types";

interface AccountWithTransactions extends BankAccount {
  transactions: Transaction[];
}

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<AccountWithTransactions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (acc) =>
        (acc.company_name ?? "").toLowerCase().includes(q) ||
        (acc.name ?? "").toLowerCase().includes(q)
    );
  }, [accounts, search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/accounts-summary");
      if (!res.ok) throw new Error("Échec du chargement du tableau de bord");
      const data = await res.json();
      setAccounts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 overflow-auto p-6">
          <p className="text-[var(--muted-foreground)]">Chargement…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-auto p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary-muted)] text-[var(--primary)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="9" />
              <rect x="14" y="3" width="7" height="5" />
              <rect x="14" y="12" width="7" height="9" />
              <rect x="3" y="16" width="7" height="5" />
            </svg>
          </div>
          <div>
            <h1 className="page-title text-2xl font-semibold">
              Tableau de bord
            </h1>
            <p className="text-sm text-[var(--muted-foreground)]">Vue d&apos;ensemble des comptes</p>
          </div>
        </div>

        {accounts.length > 0 && (
          <div className="mb-4">
            <input
              type="search"
              placeholder="Rechercher par société ou compte…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              aria-label="Rechercher par nom de société ou de compte"
            />
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-[var(--destructive-muted)] bg-[var(--destructive-muted)]/50 px-3 py-2 text-sm text-[var(--destructive)]">
            {error}
          </div>
        )}

        {accounts.length === 0 ? (
          <p className="text-[var(--muted-foreground)]">
            Aucun compte avec des transactions récentes.
          </p>
        ) : filteredAccounts.length === 0 ? (
          <p className="text-[var(--muted-foreground)]">
            Aucun compte ne correspond à « {search} ».
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filteredAccounts.map((acc) => (
              <AccountVignette
                key={acc.id}
                bankAccount={acc}
                transactions={acc.transactions ?? []}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
