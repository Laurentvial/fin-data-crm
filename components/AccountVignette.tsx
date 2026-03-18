"use client";

import Link from "next/link";
import { AccountStatusBadge } from "@/components/AccountStatusBadge";
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export function AccountVignette({
  bankAccount,
  transactions,
  hideCompanyName,
  onDelete,
  deleting,
}: {
  bankAccount: BankAccount;
  transactions: Transaction[];
  hideCompanyName?: boolean;
  onDelete?: (ba: BankAccount) => void;
  deleting?: boolean;
}) {
  const balance = bankAccount.balance ?? 0;

  return (
    <div className="relative flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--card-shadow)] transition-all hover:shadow-[var(--card-hover-shadow)] hover:border-[var(--primary-muted-border)]">
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(bankAccount);
          }}
          disabled={deleting}
          className="absolute right-3 top-3 rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
          aria-label="Supprimer le compte"
          title="Supprimer le compte"
        >
          <TrashIcon />
        </button>
      )}
      <h3 className="subsection-header flex items-center gap-2 font-semibold pr-8">
        {bankAccount.bank_id && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-[var(--muted)]">
            {bankAccount.has_logo ? (
              <img
                src={`/api/banks/${bankAccount.bank_id}/files/logo`}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : null}
          </span>
        )}
        {bankAccount.name}
      </h3>
      {!hideCompanyName && bankAccount.company_name && (
        <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
          {bankAccount.company_name}
        </p>
      )}
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
        {bankAccount.account_type_name && (
          <span className="text-[var(--muted-foreground)]">{bankAccount.account_type_name}</span>
        )}
        {bankAccount.account_type_name && (
          <span className="text-[var(--muted-foreground)]">·</span>
        )}
        <AccountStatusBadge status={bankAccount.account_status ?? "Ouvert"} />
      </p>
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
                className={`shrink-0 tabular-nums font-medium ${
                  tx.type === "DEBIT"
                    ? "text-[var(--destructive)]"
                    : "text-[var(--success)]"
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
        className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors"
      >
        <ListIcon className="h-4 w-4" />
        Voir les transactions
      </Link>
    </div>
  );
}
