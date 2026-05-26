"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AccountVignette } from "@/components/AccountVignette";
import { DeleteConfirmationModal } from "@/components/DeleteConfirmationModal";
import { canAccessTransactions, canMutate } from "@/lib/auth/permissions";
import { getCachedSession } from "@/lib/auth/session-cache";
import type { BankAccount, Company, Transaction } from "@/lib/types";

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export default function CompanyAccountsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [transactionsByAccount, setTransactionsByAccount] = useState<
    Record<string, Transaction[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingBankAccountId, setDeletingBankAccountId] = useState<string | null>(null);
  const [bankAccountToDelete, setBankAccountToDelete] = useState<BankAccount | null>(null);
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [sessionRoleLoading, setSessionRoleLoading] = useState(true);
  const canEditData = canMutate(sessionRole);
  const canViewTransactions = canAccessTransactions(sessionRole);

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
            txMap[ba.id] = Array.isArray(txData) ? txData : (txData.transactions ?? []);
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

  useEffect(() => {
    let mounted = true;
    const loadSessionRole = async () => {
      try {
        const session = await getCachedSession();
        if (!mounted) return;
        setSessionRole(session?.user?.role ?? null);
      } catch {
        if (mounted) setSessionRole(null);
      } finally {
        if (mounted) setSessionRoleLoading(false);
      }
    };
    void loadSessionRole();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionRoleLoading && !canEditData) {
      router.replace(`/societes/${id}`);
    }
  }, [canEditData, id, router, sessionRoleLoading]);

  const handleDeleteBankAccount = async (ba: BankAccount) => {
    setDeletingBankAccountId(ba.id);
    setError(null);
    try {
      const res = await fetch(`/api/bank-accounts/${ba.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la suppression");
      }
      setBankAccounts((prev) => prev.filter((b) => b.id !== ba.id));
      setTransactionsByAccount((prev) => {
        const next = { ...prev };
        delete next[ba.id];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      throw e;
    } finally {
      setDeletingBankAccountId(null);
    }
  };

  if (loading || sessionRoleLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 overflow-auto p-6">
          <p className="text-[var(--muted-foreground)]">Chargement…</p>
        </main>
      </div>
    );
  }

  if (!canEditData) return null;

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

        <h1 className="page-title mb-6 text-2xl font-semibold">
          {company?.name ?? "Société"} – Comptes bancaires
        </h1>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        {bankAccounts.length === 0 && (
          <p className="mb-4 text-[var(--muted-foreground)]">
            Aucun compte bancaire lié à cette société.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {bankAccounts.map((ba) => (
            <AccountVignette
              key={ba.id}
              bankAccount={ba}
              transactions={transactionsByAccount[ba.id] ?? []}
              hideCompanyName
              showTransactionsLink={canViewTransactions}
              onEdit={canEditData ? (account) => router.push(`/accounts?edit=${account.id}`) : undefined}
              onDelete={canEditData ? (account) => setBankAccountToDelete(account) : undefined}
              deleting={deletingBankAccountId === ba.id}
            />
          ))}
          {canEditData && (
            <Link
              href={`/accounts?company=${encodeURIComponent(id)}`}
              className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-[var(--card-shadow)] transition-all hover:border-[var(--primary-muted-border)] hover:bg-[var(--muted)] hover:shadow-[var(--card-hover-shadow)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
              title="Ajouter un compte bancaire pour cette société"
            >
              <span
                className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-[var(--primary-muted-border)] text-[var(--primary)]"
                aria-hidden
              >
                <PlusIcon />
              </span>
              <span className="text-sm font-semibold text-[var(--foreground)]">Ajouter un compte</span>
              <span className="mt-2 text-center text-xs leading-snug text-[var(--muted-foreground)]">
                Raccourci vers{" "}
                <span className="font-medium text-[var(--foreground)]">Comptes</span>
                <span className="mx-1 text-[var(--muted-foreground)]" aria-hidden>
                  →
                </span>
                <kbd className="rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--foreground)]">
                  création
                </kbd>
              </span>
            </Link>
          )}
        </div>
      </main>

      {canEditData && bankAccountToDelete && (
        <DeleteConfirmationModal
          title="Supprimer le compte bancaire"
          expectedText={`supprimer ${bankAccountToDelete.name} - ${bankAccountToDelete.company_name ?? company?.name ?? ""}`}
          message="Cette action est irréversible."
          onConfirm={async () => {
            await handleDeleteBankAccount(bankAccountToDelete);
            setBankAccountToDelete(null);
          }}
          onClose={() => setBankAccountToDelete(null)}
          deleting={deletingBankAccountId === bankAccountToDelete.id}
        />
      )}
    </div>
  );
}
