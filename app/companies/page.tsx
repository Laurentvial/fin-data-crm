"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { BankAccount, Company } from "@/lib/types";

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function displayName(ba: BankAccount): string {
  return ba.company_name !== ba.name ? `${ba.company_name} – ${ba.name}` : ba.name;
}

function EditBankAccountModal({
  bankAccount,
  companies,
  name,
  companyId,
  telegramChatId,
  onNameChange,
  onCompanyIdChange,
  onTelegramChatIdChange,
  onSave,
  onClose,
  saving,
}: {
  bankAccount: BankAccount;
  companies: Company[];
  name: string;
  companyId: string;
  telegramChatId: string;
  onNameChange: (v: string) => void;
  onCompanyIdChange: (v: string) => void;
  onTelegramChatIdChange: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-medium text-[var(--foreground)]">
          Modifier {displayName(bankAccount)}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom du compte</label>
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Ex. Compte courant"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Société</label>
            <select
              value={companyId}
              onChange={(e) => onCompanyIdChange(e.target.value)}
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Telegram Chat ID</label>
            <input
              type="text"
              value={telegramChatId}
              onChange={(e) => onTelegramChatIdChange(e.target.value)}
              placeholder="Ex. 123456789"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !name.trim() || !companyId}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CompaniesPage() {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editTelegramChatId, setEditTelegramChatId] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchBankAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resBa, resCo] = await Promise.all([
        fetch("/api/bank-accounts"),
        fetch("/api/companies"),
      ]);
      if (!resBa.ok) throw new Error("Échec du chargement des comptes");
      if (!resCo.ok) throw new Error("Échec du chargement des sociétés");
      const [dataBa, dataCo] = await Promise.all([resBa.json(), resCo.json()]);
      setBankAccounts(dataBa);
      setCompanies(dataCo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBankAccounts();
  }, [fetchBankAccounts]);

  const openEdit = (ba: BankAccount) => {
    setEditingAccount(ba);
    setEditName(ba.name);
    setEditCompanyId(ba.company_id);
    setEditTelegramChatId(String(ba.telegram_chat_id ?? ""));
    setError(null);
  };

  const closeModal = () => {
    setEditingAccount(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!editingAccount) return;
    const name = editName.trim();
    if (!name || !editCompanyId) return;
    setSaving(true);
    setError(null);
    try {
      const body: { name: string; company_id: string; telegram_chat_id?: number } = {
        name,
        company_id: editCompanyId,
      };
      const tid = editTelegramChatId.trim();
      if (tid) {
        const num = parseInt(tid, 10);
        if (!Number.isNaN(num)) body.telegram_chat_id = num;
      }
      const res = await fetch(`/api/bank-accounts/${editingAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la mise à jour");
      }
      const updated = await res.json();
      setBankAccounts((prev) =>
        prev.map((ba) =>
          ba.id === editingAccount.id
            ? {
                ...ba,
                name: updated.name,
                company_id: updated.company_id,
                company_name: companies.find((c) => c.id === updated.company_id)?.name ?? ba.company_name,
                telegram_chat_id: updated.telegram_chat_id,
              }
            : ba
        )
      );
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-auto p-6">
        <h1 className="mb-6 text-2xl font-semibold text-[var(--foreground)]">Comptes bancaires</h1>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-[var(--muted-foreground)]">Chargement…</p>
        ) : bankAccounts.length === 0 ? (
          <p className="text-[var(--muted-foreground)]">Aucun compte.</p>
        ) : (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Compte
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Solde
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {bankAccounts.map((ba) => {
                  const balance = ba.balance ?? 0;
                  return (
                    <tr
                      key={ba.id}
                      className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)]/50"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--foreground)]">{displayName(ba)}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-[var(--foreground)]">
                        {new Intl.NumberFormat("fr-FR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                          signDisplay: "always",
                        }).format(balance)}{" "}
                        €
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(ba)}
                            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
                          >
                            <PencilIcon className="h-4 w-4" />
                            Modifier
                          </button>
                          <Link
                            href={`/?bank_account_id=${encodeURIComponent(ba.id)}`}
                            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
                          >
                            <ListIcon className="h-4 w-4" />
                            Voir les transactions
                          </Link>
                          <Link
                            href={`/reporting?bank_account_id=${encodeURIComponent(ba.id)}`}
                            className="inline-flex items-center gap-2 rounded-lg border border-[var(--primary)] bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
                          >
                            <ChartIcon className="h-4 w-4" />
                            Rapports
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {editingAccount && (
        <EditBankAccountModal
          bankAccount={editingAccount}
          companies={companies}
          name={editName}
          companyId={editCompanyId}
          telegramChatId={editTelegramChatId}
          onNameChange={setEditName}
          onCompanyIdChange={setEditCompanyId}
          onTelegramChatIdChange={setEditTelegramChatId}
          onSave={handleSave}
          onClose={closeModal}
          saving={saving}
        />
      )}
    </div>
  );
}
