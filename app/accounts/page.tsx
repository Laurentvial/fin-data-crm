"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { BankSelect } from "@/components/BankSelect";
import type { Bank, BankAccount, Company } from "@/lib/types";

function MoreVerticalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="6" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

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

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function displayName(ba: BankAccount): string {
  return ba.company_name !== ba.name ? `${ba.company_name} – ${ba.name}` : ba.name;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

function AccountCard({
  bankAccount,
  menuOpen,
  onMenuToggle,
  onEdit,
  onDelete,
  onCardClick,
  deleting,
}: {
  bankAccount: BankAccount;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onEdit: (ba: BankAccount) => void;
  onDelete: (ba: BankAccount) => void;
  onCardClick: (ba: BankAccount) => void;
  deleting: boolean;
}) {
  const [logoError, setLogoError] = useState(false);
  const balance = bankAccount.balance ?? 0;

  return (
    <div
      className="relative flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition-shadow hover:shadow-md"
      onClick={() => onCardClick(bankAccount)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCardClick(bankAccount);
        }
      }}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]">
        {bankAccount.bank_id && !logoError ? (
          <img
            src={`/api/banks/${bankAccount.bank_id}/files/logo`}
            alt=""
            className="h-full w-full object-contain"
            onError={() => setLogoError(true)}
          />
        ) : (
          <span className="text-sm font-semibold text-[var(--muted-foreground)]">
            {getInitials(bankAccount.name)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-semibold text-[var(--foreground)]">{bankAccount.name}</h3>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMenuToggle();
            }}
            className="shrink-0 rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            aria-label="Menu"
          >
            <MoreVerticalIcon />
          </button>
        </div>
        <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
          {bankAccount.company_name ?? "—"}
        </p>
        <p className="mt-1 text-lg font-medium tabular-nums text-[var(--foreground)]">
          {new Intl.NumberFormat("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
            signDisplay: "always",
          }).format(balance)}{" "}
          €
        </p>
      </div>
      {menuOpen && (
        <AccountCardMenu
          bankAccount={bankAccount}
          onClose={onMenuToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          deleting={deleting}
        />
      )}
    </div>
  );
}

function AccountCardMenu({
  bankAccount,
  onClose,
  onEdit,
  onDelete,
  deleting,
}: {
  bankAccount: BankAccount;
  onClose: () => void;
  onEdit: (ba: BankAccount) => void;
  onDelete: (ba: BankAccount) => void;
  deleting: boolean;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        aria-hidden="true"
      />
      <div
        className="absolute right-2 top-12 z-50 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <Link
          href={`/accounts/${bankAccount.id}`}
          onClick={onClose}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          <ExternalLinkIcon className="h-4 w-4" />
          Voir informations
        </Link>
        <Link
          href={`/?bank_account_id=${encodeURIComponent(bankAccount.id)}`}
          onClick={onClose}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          <ListIcon className="h-4 w-4" />
          Voir les transactions
        </Link>
        <Link
          href={`/reporting?bank_account_id=${encodeURIComponent(bankAccount.id)}`}
          onClick={onClose}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          <ChartIcon className="h-4 w-4" />
          Rapports
        </Link>
        <button
          type="button"
          onClick={() => {
            onClose();
            onEdit(bankAccount);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          <PencilIcon className="h-4 w-4" />
          Modifier
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            onDelete(bankAccount);
          }}
          disabled={deleting}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-[var(--muted)] disabled:opacity-50 dark:text-red-400"
        >
          <TrashIcon className="h-4 w-4" />
          {deleting ? "Suppression…" : "Supprimer"}
        </button>
      </div>
    </>
  );
}

function CreateBankAccountModal({
  companies,
  banks,
  name,
  companyId,
  bankId,
  ibans,
  onNameChange,
  onCompanyIdChange,
  onBankIdChange,
  onIbansChange,
  onSubmit,
  onClose,
  saving,
  error,
  inviteWarning,
}: {
  companies: Company[];
  banks: Bank[];
  name: string;
  companyId: string;
  bankId: string;
  ibans: string[];
  onNameChange: (v: string) => void;
  onCompanyIdChange: (v: string) => void;
  onBankIdChange: (v: string) => void;
  onIbansChange: (v: string[]) => void;
  onSubmit: () => void;
  onClose: () => void;
  saving: boolean;
  error?: string | null;
  inviteWarning?: string | null;
}) {
  const addIban = () => onIbansChange([...ibans, ""]);
  const removeIban = (i: number) => onIbansChange(ibans.filter((_, idx) => idx !== i));
  const setIban = (i: number, v: string) => {
    const next = [...ibans];
    next[i] = v;
    onIbansChange(next);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-medium text-[var(--foreground)]">Créer un compte bancaire</h3>
        <p className="mb-4 text-sm text-[var(--muted-foreground)]">
          Un groupe Telegram sera créé automatiquement et lié à ce compte.
        </p>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}
        {inviteWarning && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {inviteWarning}
          </div>
        )}
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
              <option value="">Sélectionner une société</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Banque</label>
            <BankSelect
              value={bankId}
              onChange={onBankIdChange}
              banks={banks}
              placeholder="Aucune banque"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-[var(--foreground)]">IBAN</label>
              <button
                type="button"
                onClick={addIban}
                className="text-xs text-[var(--primary)] hover:underline"
              >
                + Ajouter un IBAN
              </button>
            </div>
            {ibans.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">Aucun IBAN. Cliquez sur &quot;+ Ajouter un IBAN&quot; si besoin.</p>
            ) : (
              <div className="space-y-2">
                {ibans.map((iban, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={iban}
                      onChange={(e) => setIban(i, e.target.value)}
                      placeholder="FR76 1234 5678 9012 3456 7890 123"
                      className="block flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => removeIban(i)}
                      className="rounded-lg border border-[var(--border)] px-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          {inviteWarning ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
            >
              Fermer
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={saving || !name.trim() || !companyId}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Création…" : "Créer"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EditBankAccountModal({
  bankAccount,
  companies,
  banks,
  name,
  companyId,
  bankId,
  telegramChatId,
  ibans,
  onNameChange,
  onCompanyIdChange,
  onBankIdChange,
  onTelegramChatIdChange,
  onIbansChange,
  onSave,
  onClose,
  saving,
  error,
}: {
  bankAccount: BankAccount;
  companies: Company[];
  banks: Bank[];
  name: string;
  companyId: string;
  bankId: string;
  telegramChatId: string;
  ibans: string[];
  onNameChange: (v: string) => void;
  onCompanyIdChange: (v: string) => void;
  onBankIdChange: (v: string) => void;
  onTelegramChatIdChange: (v: string) => void;
  onIbansChange: (v: string[]) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error?: string | null;
}) {
  const addIban = () => onIbansChange([...ibans, ""]);
  const removeIban = (i: number) => onIbansChange(ibans.filter((_, idx) => idx !== i));
  const setIban = (i: number, v: string) => {
    const next = [...ibans];
    next[i] = v;
    onIbansChange(next);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-medium text-[var(--foreground)]">
          Modifier {displayName(bankAccount)}
        </h3>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}
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
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Banque</label>
            <BankSelect
              value={bankId}
              onChange={onBankIdChange}
              banks={banks}
              placeholder="Aucune banque"
            />
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
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-[var(--foreground)]">IBAN</label>
              <button
                type="button"
                onClick={addIban}
                className="text-xs text-[var(--primary)] hover:underline"
              >
                + Ajouter un IBAN
              </button>
            </div>
            {ibans.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">Aucun IBAN.</p>
            ) : (
              <div className="space-y-2">
                {ibans.map((iban, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={iban}
                      onChange={(e) => setIban(i, e.target.value)}
                      placeholder="FR76 1234 5678 9012 3456 7890 123"
                      className="block flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => removeIban(i)}
                      className="rounded-lg border border-[var(--border)] px-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
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

function AccountsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editIdFromUrl = searchParams.get("edit");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editBankId, setEditBankId] = useState("");
  const [editTelegramChatId, setEditTelegramChatId] = useState("");
  const [editIbans, setEditIbans] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCompanyId, setCreateCompanyId] = useState("");
  const [createBankId, setCreateBankId] = useState("");
  const [createIbans, setCreateIbans] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createInviteWarning, setCreateInviteWarning] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchBankAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resBa, resCo, resBanks] = await Promise.all([
        fetch("/api/bank-accounts"),
        fetch("/api/accounts"),
        fetch("/api/banks"),
      ]);
      if (!resBa.ok) throw new Error("Échec du chargement des comptes");
      if (!resCo.ok) throw new Error("Échec du chargement des sociétés");
      const [dataBa, dataCo, dataBanks] = await Promise.all([
        resBa.json(),
        resCo.json(),
        resBanks.ok ? resBanks.json() : Promise.resolve([]),
      ]);
      setBankAccounts(dataBa);
      setCompanies(dataCo);
      setBanks(Array.isArray(dataBanks) ? dataBanks : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBankAccounts();
  }, [fetchBankAccounts]);

  useEffect(() => {
    if (editIdFromUrl && bankAccounts.length > 0) {
      const account = bankAccounts.find((ba) => ba.id === editIdFromUrl);
      if (account) {
        setEditingAccount(account);
        setEditName(account.name);
        setEditCompanyId(account.company_id);
        setEditBankId(account.bank_id ?? "");
        setEditTelegramChatId(String(account.telegram_chat_id ?? ""));
        setEditIbans(account.ibans ?? []);
        setError(null);
      }
    }
  }, [editIdFromUrl, bankAccounts]);

  const openEdit = (ba: BankAccount) => {
    setEditingAccount(ba);
    setEditName(ba.name);
    setEditCompanyId(ba.company_id);
    setEditBankId(ba.bank_id ?? "");
    setEditTelegramChatId(String(ba.telegram_chat_id ?? ""));
    setEditIbans(ba.ibans ?? []);
    setError(null);
  };

  const closeModal = () => {
    setEditingAccount(null);
    setMenuOpenId(null);
    setError(null);
    if (editIdFromUrl) router.replace("/accounts");
  };

  const handleDelete = async (ba: BankAccount) => {
    if (!confirm(`Supprimer le compte « ${displayName(ba)} » ? Cette action est irréversible.`)) return;
    setDeletingId(ba.id);
    setError(null);
    try {
      const res = await fetch(`/api/bank-accounts/${ba.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la suppression");
      }
      setBankAccounts((prev) => prev.filter((b) => b.id !== ba.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setDeletingId(null);
    }
  };

  const openCreateModal = () => {
    setCreateModalOpen(true);
    setCreateName("");
    setCreateCompanyId(companies[0]?.id ?? "");
    setCreateBankId("");
    setCreateIbans([]);
    setError(null);
    setCreateInviteWarning(null);
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    setError(null);
    setCreateInviteWarning(null);
  };

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name || !createCompanyId) return;
    setCreating(true);
    setError(null);
    try {
      const ibansToSend = createIbans
        .map((v) => v.trim().replace(/\s/g, "").toUpperCase())
        .filter((v) => v.length > 0);
      const body: { name: string; company_id: string; bank_id?: string; ibans: string[] } = {
        name,
        company_id: createCompanyId,
        ibans: ibansToSend,
      };
      if (createBankId) body.bank_id = createBankId;
      const res = await fetch("/api/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la création");
      }
      const created = await res.json();
      setBankAccounts((prev) => [...prev, created].sort((a, b) => (a.company_name ?? "").localeCompare(b.company_name ?? "") || a.name.localeCompare(b.name)));
      const warnings = created.telegram_invite_warnings as { telegram_id: number; name?: string; telegram_username?: string; reason: string }[] | undefined;
      if (Array.isArray(warnings) && warnings.length > 0) {
        const names = warnings.map((w) => w.name || (w.telegram_username ? `@${w.telegram_username}` : `ID ${w.telegram_id}`));
        const reasonMsg =
          warnings.some((w) => w.reason === "UserNotMutualContactError")
            ? "Ils doivent être dans les contacts du compte Telegram admin."
            : warnings.some((w) => w.reason === "UserPrivacyRestrictedError")
              ? "Paramètres de confidentialité Telegram : la personne doit aller dans Paramètres → Confidentialité → Groupes et canaux → « Qui peut vous ajouter aux groupes » et choisir « Tout le monde » ou « Mes contacts »."
              : warnings.length > 0
                ? `Raison technique : ${warnings.map((w) => w.reason).filter(Boolean).join(", ")}`
                : null;
        setCreateInviteWarning(
          `${warnings.length} utilisateur(s) n'ont pas pu être ajoutés : ${names.join(", ")}. ${reasonMsg ?? ""}`
        );
      } else {
        closeCreateModal();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!editingAccount) return;
    const name = editName.trim();
    if (!name || !editCompanyId) return;
    setSaving(true);
    setError(null);
    try {
      const body: { name: string; company_id: string; bank_id?: string | null; telegram_chat_id?: number; ibans?: string[] } = {
        name,
        company_id: editCompanyId,
      };
      body.bank_id = editBankId || null;
      const tid = editTelegramChatId.trim();
      if (tid) {
        const num = parseInt(tid, 10);
        if (!Number.isNaN(num)) body.telegram_chat_id = num;
      }
      const ibansToSend = editIbans
        .map((v) => v.trim().replace(/\s/g, "").toUpperCase())
        .filter((v) => v.length > 0);
      body.ibans = ibansToSend;
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
                bank_id: updated.bank_id ?? undefined,
                bank_name: updated.bank_name ?? undefined,
                telegram_chat_id: updated.telegram_chat_id,
                ibans: updated.ibans ?? ba.ibans,
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
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Comptes bancaires</h1>
          {companies.length > 0 && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
            >
              <PlusIcon className="h-4 w-4" />
              Créer un compte
            </button>
          )}
        </div>
        {error && !createModalOpen && !editingAccount && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-[var(--muted-foreground)]">Chargement…</p>
        ) : bankAccounts.length === 0 ? (
          <p className="text-[var(--muted-foreground)]">Aucun compte.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {bankAccounts.map((ba) => (
              <AccountCard
                key={ba.id}
                bankAccount={ba}
                menuOpen={menuOpenId === ba.id}
                onMenuToggle={() => setMenuOpenId((prev) => (prev === ba.id ? null : ba.id))}
                onEdit={openEdit}
                onDelete={handleDelete}
                onCardClick={(account) => router.push(`/?bank_account_id=${encodeURIComponent(account.id)}`)}
                deleting={deletingId === ba.id}
              />
            ))}
          </div>
        )}
      </main>

      {editingAccount && (
        <EditBankAccountModal
          bankAccount={editingAccount}
          companies={companies}
          banks={banks}
          name={editName}
          companyId={editCompanyId}
          bankId={editBankId}
          telegramChatId={editTelegramChatId}
          ibans={editIbans}
          onNameChange={(v) => {
            setEditName(v);
            setError(null);
          }}
          onCompanyIdChange={(v) => {
            setEditCompanyId(v);
            setError(null);
          }}
          onBankIdChange={(v) => {
            setEditBankId(v);
            setError(null);
          }}
          onTelegramChatIdChange={(v) => {
            setEditTelegramChatId(v);
            setError(null);
          }}
          onIbansChange={(v) => {
            setEditIbans(v);
            setError(null);
          }}
          onSave={handleSave}
          onClose={closeModal}
          saving={saving}
          error={error}
        />
      )}
      {createModalOpen && (
        <CreateBankAccountModal
          companies={companies}
          banks={banks}
          name={createName}
          companyId={createCompanyId}
          bankId={createBankId}
          ibans={createIbans}
          onNameChange={(v) => {
            setCreateName(v);
            setError(null);
          }}
          onCompanyIdChange={(v) => {
            setCreateCompanyId(v);
            setError(null);
          }}
          onBankIdChange={(v) => {
            setCreateBankId(v);
            setError(null);
          }}
          onIbansChange={(v) => {
            setCreateIbans(v);
            setError(null);
          }}
          onSubmit={handleCreate}
          onClose={closeCreateModal}
          saving={creating}
          error={error}
          inviteWarning={createInviteWarning}
        />
      )}
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen flex-col p-6"><p className="text-[var(--muted-foreground)]">Chargement…</p></div>}>
      <AccountsPageContent />
    </Suspense>
  );
}
