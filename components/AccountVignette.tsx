"use client";

import Link from "next/link";
import { useState } from "react";
import { AccountStatusBadge } from "@/components/AccountStatusBadge";
import { IbanCopyRows } from "@/components/IbanCopyRows";
import type { BankAccount, IbanItem, Transaction } from "@/lib/types";

function formatIbanForDisplay(iban: string): string {
  const raw = iban.replace(/\s/g, "").toUpperCase();
  if (!raw) return iban;
  return raw.replace(/(.{4})/g, "$1 ").trim();
}

function getFullIbans(ibans: IbanItem[] | undefined): string[] {
  if (!ibans?.length) return [];
  return ibans
    .map((item) => (item.iban ?? "").trim())
    .filter((s) => s.length > 0)
    .map(formatIbanForDisplay);
}

function MoreVerticalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="6" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

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

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

export function AccountVignette({
  bankAccount,
  transactions,
  hideCompanyName,
  onEdit,
  onDelete,
  deleting,
}: {
  bankAccount: BankAccount;
  transactions: Transaction[];
  hideCompanyName?: boolean;
  onEdit?: (ba: BankAccount) => void;
  onDelete?: (ba: BankAccount) => void;
  deleting?: boolean;
}) {
  const balance = bankAccount.balance ?? 0;
  const fullIbans = getFullIbans(bankAccount.ibans);
  const [menuOpen, setMenuOpen] = useState(false);
  const cardBgStyle = (() => {
    const color = bankAccount.account_status_background_color;
    if (!color) return undefined;
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
    if (!m) return undefined;
    const opacity = bankAccount.account_status_background_opacity != null ? bankAccount.account_status_background_opacity : 0.25;
    return { backgroundColor: `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${opacity})` };
  })();

  return (
    <div
      className="relative flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--card-shadow)] transition-all hover:shadow-[var(--card-hover-shadow)] hover:border-[var(--primary-muted-border)]"
      style={cardBgStyle}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen((prev) => !prev);
        }}
        className="absolute right-3 top-3 rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        aria-label="Menu"
        aria-expanded={menuOpen}
      >
        <MoreVerticalIcon />
      </button>
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
            }}
            aria-hidden="true"
          />
          <div
            className="absolute right-3 top-10 z-50 min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              href={`/accounts/${bankAccount.id}`}
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
            >
              <ExternalLinkIcon className="h-4 w-4" />
              Voir les informations du compte
            </Link>
            <Link
              href={`/?bank_account_id=${encodeURIComponent(bankAccount.id)}`}
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
            >
              <ListIcon className="h-4 w-4" />
              Voir les transactions
            </Link>
            <Link
              href={`/reporting?bank_account_id=${encodeURIComponent(bankAccount.id)}`}
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
            >
              <ChartIcon className="h-4 w-4" />
              Rapports
            </Link>
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(false);
                  onEdit(bankAccount);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
              >
                <PencilIcon className="h-4 w-4" />
                Modifier
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete(bankAccount);
                }}
                disabled={deleting}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-[var(--muted)] disabled:opacity-50 dark:text-red-400"
              >
                <TrashIcon className="h-4 w-4" />
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            )}
          </div>
        </>
      )}
      <div className="pr-8">
        <div className="subsection-header flex min-w-0 flex-1 flex-col gap-0 font-semibold">
          <div className="flex items-center gap-2">
            {bankAccount.bank_id && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-[var(--muted)]">
                {bankAccount.has_logo ? (
                  <img
                    src={`/api/banks/${bankAccount.bank_id}/files/logo`}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                ) : null}
              </span>
            )}
            <span className="truncate">{bankAccount.name}</span>
          </div>
          {!hideCompanyName && bankAccount.company_name && (
            bankAccount.company_id ? (
              <Link
                href={`/societes/${bankAccount.company_id}`}
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5 block text-base font-medium text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors"
              >
                {bankAccount.company_name}
              </Link>
            ) : (
              <span className="mt-0.5 block text-base font-medium text-[var(--foreground)]">
                {bankAccount.company_name}
              </span>
            )
          )}
        </div>
      </div>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--foreground)]">
        {bankAccount.account_type_name && (
          <span>
            {bankAccount.account_type_emoji?.trim() ? `${bankAccount.account_type_emoji.trim()} ` : ""}
            {bankAccount.account_type_name}
          </span>
        )}
        {bankAccount.account_type_name && (
          <span>·</span>
        )}
        <AccountStatusBadge
          status={bankAccount.account_status_name ?? bankAccount.account_status ?? "Ouvert"}
          emoji={bankAccount.account_status_emoji}
        />
      </p>
      <IbanCopyRows lines={fullIbans} />
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
