"use client";

import Link from "next/link";
import type { BankAccount, Transaction } from "@/lib/types";

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

export function formatAmount(amount: number | string, type: string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  const signed = type === "DEBIT" ? -n : n;
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "always",
  }).format(signed);
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function AccountVignette({
  bankAccount,
  transactions,
  hideCompanyName,
}: {
  bankAccount: BankAccount;
  transactions: Transaction[];
  hideCompanyName?: boolean;
}) {
  const balance = bankAccount.balance ?? 0;

  return (
    <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition-shadow hover:shadow-md">
      <h3 className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
        {bankAccount.bank_id && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-[var(--muted)]">
            <img
              src={`/api/banks/${bankAccount.bank_id}/files/logo`}
              alt=""
              className="h-full w-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </span>
        )}
        {bankAccount.name}
      </h3>
      {!hideCompanyName && bankAccount.company_name && (
        <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
          {bankAccount.company_name}
        </p>
      )}
      <p className="mt-1 text-lg font-medium tabular-nums text-[var(--foreground)]">
        {new Intl.NumberFormat("fr-FR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
          signDisplay: "always",
        }).format(balance)}{" "}
        €
      </p>
      <div className="mt-3 flex-1 space-y-1.5">
        {transactions.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)]">Aucune transaction récente</p>
        ) : (
          transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="shrink-0 text-[var(--muted-foreground)]">
                {formatDate(tx.transaction_date)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--foreground)]" title={tx.description}>
                {tx.description || "—"}
              </span>
              <span
                className={`shrink-0 tabular-nums ${
                  tx.type === "DEBIT"
                    ? "text-red-600 dark:text-red-400"
                    : "text-green-600 dark:text-green-400"
                }`}
              >
                {formatAmount(tx.amount, tx.type)} €
              </span>
            </div>
          ))
        )}
      </div>
      <Link
        href={`/?bank_account_id=${encodeURIComponent(bankAccount.id)}`}
        className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--primary)] hover:underline"
      >
        <ListIcon className="h-4 w-4" />
        Voir les transactions
      </Link>
    </div>
  );
}
