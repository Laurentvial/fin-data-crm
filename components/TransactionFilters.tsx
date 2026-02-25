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
  return ba.company_name !== ba.name ? `${ba.company_name} – ${ba.name}` : ba.name;
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
    <div className="flex flex-wrap items-end gap-4 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-bank-account" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Compte
        </label>
        <select
          id="filter-bank-account"
          value={bankAccountId}
          onChange={(e) => onBankAccountIdChange(e.target.value)}
          className="min-w-[180px] rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
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
        <label htmlFor="filter-date-from" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Du
        </label>
        <input
          id="filter-date-from"
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-date-to" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Au
        </label>
        <input
          id="filter-date-to"
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-type" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Type
        </label>
        <select
          id="filter-type"
          value={type}
          onChange={(e) => onTypeChange(e.target.value)}
          className="min-w-[120px] rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
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
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {loading ? "Chargement…" : "Appliquer"}
      </button>
    </div>
  );
}
