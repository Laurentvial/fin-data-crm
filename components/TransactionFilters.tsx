"use client";

import type { BankAccount } from "@/lib/types";

interface TransactionFiltersProps {
  bankAccounts: BankAccount[];
  bankAccountId: string;
  dateFrom: string;
  dateTo: string;
  type: string;
  onBankAccountIdChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onApply: () => void;
  loading?: boolean;
}

function displayName(ba: BankAccount): string {
  return ba.company_name !== ba.name ? `${ba.name} – ${ba.company_name}` : ba.name;
}

export function TransactionFilters({
  bankAccounts,
  bankAccountId,
  dateFrom,
  dateTo,
  type,
  onBankAccountIdChange,
  onDateFromChange,
  onDateToChange,
  onTypeChange,
  onApply,
  loading = false,
}: TransactionFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-[var(--primary-muted-border)] bg-[var(--primary-muted)]/50 p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-bank-account" className="text-xs font-medium text-[var(--muted-foreground)]">
          Compte
        </label>
        <select
          id="filter-bank-account"
          value={bankAccountId}
          onChange={(e) => onBankAccountIdChange(e.target.value)}
          className="min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
        >
          <option value="">Tous</option>
          {bankAccounts.map((ba) => (
            <option key={ba.id} value={ba.id}>
              {displayName(ba)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-date-from" className="text-xs font-medium text-[var(--muted-foreground)]">
          Du
        </label>
        <input
          id="filter-date-from"
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--primary)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-date-to" className="text-xs font-medium text-[var(--muted-foreground)]">
          Au
        </label>
        <input
          id="filter-date-to"
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--primary)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-type" className="text-xs font-medium text-[var(--muted-foreground)]">
          Type
        </label>
        <select
          id="filter-type"
          value={type}
          onChange={(e) => onTypeChange(e.target.value)}
          className="min-w-[120px] rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--primary)]"
        >
          <option value="">Tous</option>
          <option value="DEBIT">Débit</option>
          <option value="CREDIT">Crédit</option>
        </select>
      </div>
      <button
        type="button"
        onClick={onApply}
        disabled={loading}
        className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:opacity-50 transition-colors shadow-sm"
      >
        {loading ? "Chargement…" : "Appliquer"}
      </button>
    </div>
  );
}
