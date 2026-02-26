"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AccountVignette } from "@/components/AccountVignette";
import type { BankAccount, Company, Transaction } from "@/lib/types";

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export default function CompanyAccountsPage() {
  const params = useParams();
  const id = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [transactionsByAccount, setTransactionsByAccount] = useState<
    Record<string, Transaction[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [resCompany, resBank] = await Promise.all([
        fetch(`/api/accounts/${id}`),
        fetch(`/api/accounts/${id}/bank-accounts`),
      ]);

      if (!resCompany.ok) throw new Error("Société introuvable");
      const companyData = await resCompany.json();
      setCompany(companyData);

      if (!resBank.ok) throw new Error("Échec du chargement des comptes");
      const bankData = await resBank.json();
      setBankAccounts(bankData);

      const txMap: Record<string, Transaction[]> = {};
      await Promise.all(
        bankData.map(async (ba: BankAccount) => {
          const resTx = await fetch(
            `/api/transactions?bank_account_id=${ba.id}&limit=5`
          );
          if (resTx.ok) {
            const txData = await resTx.json();
            txMap[ba.id] = txData;
          } else {
            txMap[ba.id] = [];
          }
        })
      );
      setTransactionsByAccount(txMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [id]);

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

  if (error && !company) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 overflow-auto p-6">
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
          <Link
            href="/societes"
            className="inline-flex items-center gap-2 text-sm text-[var(--primary)] hover:underline"
          >
            <ChevronLeftIcon />
            Retour aux sociétés
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-auto p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/societes"
            className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <ChevronLeftIcon />
            Retour aux sociétés
          </Link>
          <Link
            href={`/societes/${id}`}
            className="text-sm text-[var(--primary)] hover:underline"
          >
            Fiche société
          </Link>
        </div>

        <h1 className="mb-6 text-2xl font-semibold text-[var(--foreground)]">
          {company?.name ?? "Société"} – Comptes bancaires
        </h1>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        {bankAccounts.length === 0 ? (
          <p className="text-[var(--muted-foreground)]">
            Aucun compte bancaire lié à cette société.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {bankAccounts.map((ba) => (
              <AccountVignette
                key={ba.id}
                bankAccount={ba}
                transactions={transactionsByAccount[ba.id] ?? []}
                hideCompanyName
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
