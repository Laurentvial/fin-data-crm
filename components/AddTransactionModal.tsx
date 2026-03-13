"use client";

import { useState } from "react";
import type { BankAccount, Transaction, TransactionType } from "@/lib/types";

function displayName(ba: BankAccount): string {
  return ba.company_name !== ba.name ? `${ba.company_name} – ${ba.name}` : ba.name;
}

interface AddTransactionModalProps {
  bankAccounts: BankAccount[];
  defaultBankAccountId?: string;
  onClose: () => void;
  onSuccess: (transaction: Transaction) => void;
}

export function AddTransactionModal({
  bankAccounts,
  defaultBankAccountId = "",
  onClose,
  onSuccess,
}: AddTransactionModalProps) {
  const [bankAccountId, setBankAccountId] = useState(defaultBankAccountId || (bankAccounts[0]?.id ?? ""));
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("DEBIT");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const num = Number(amount);
    if (!bankAccountId) {
      setError("Sélectionnez un compte.");
      return;
    }
    if (!transactionDate) {
      setError("La date est requise.");
      return;
    }
    if (Number.isNaN(num) || num <= 0) {
      setError("Le montant doit être un nombre positif.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank_account_id: bankAccountId,
          transaction_date: transactionDate,
          amount: num,
          type,
          description: description.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Échec de la création");
      }
      onSuccess(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--primary-muted-border)] bg-[var(--card)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary-muted)] text-[var(--primary)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <h3 className="subsection-header text-lg font-medium">
            Ajouter une transaction
          </h3>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Compte *
            </label>
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              required
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            >
              <option value="">-- Sélectionner --</option>
              {bankAccounts.map((ba) => (
                <option key={ba.id} value={ba.id}>
                  {displayName(ba)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Date *
            </label>
            <input
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              required
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Montant *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="0.00"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Type *
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TransactionType)}
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            >
              <option value="DEBIT">Débit</option>
              <option value="CREDIT">Crédit</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description de la transaction"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            />
          </div>
          {error && (
            <div className="rounded-lg border border-[var(--destructive-muted)] bg-[var(--destructive-muted)]/50 px-3 py-2 text-sm text-[var(--destructive)]">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? "Création…" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
