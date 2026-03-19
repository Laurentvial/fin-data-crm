"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { BankSelect } from "@/components/BankSelect";
import { AccountStatusBadge } from "@/components/AccountStatusBadge";
import { CreateBankAccountModal } from "@/components/CreateBankAccountModal";
import { DeleteConfirmationModal } from "@/components/DeleteConfirmationModal";
import type { AccountStatus, AccountType, Bank, BankAccount, Company, IbanItem } from "@/lib/types";

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

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M8 10h.01M8 14h.01M16 14h.01" />
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

function getIbanCountryCodes(ibans: IbanItem[] | undefined): string[] {
  if (!ibans?.length) return [];
  const codes = ibans
    .map((item) => item.iban.replace(/\s/g, "").slice(0, 2).toUpperCase())
    .filter((c) => c.length === 2);
  return [...new Set(codes)];
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
  const balance = bankAccount.balance ?? 0;
  const ibanCountryCodes = getIbanCountryCodes(bankAccount.ibans);

  return (
    <div
      className="relative flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--card-shadow)] transition-all hover:shadow-[var(--card-hover-shadow)] hover:border-[var(--primary-muted-border)]"
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
        {bankAccount.bank_id && bankAccount.has_logo ? (
          <img
            src={`/api/banks/${bankAccount.bank_id}/files/logo`}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-sm font-semibold text-[var(--muted-foreground)]">
            {getInitials(bankAccount.name)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-semibold text-[var(--foreground)]">{displayName(bankAccount)}</h3>
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
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
          {bankAccount.account_type_name && (
            <span className="text-[var(--muted-foreground)]">{bankAccount.account_type_name}</span>
          )}
          {bankAccount.account_type_name && (
            <span className="text-[var(--muted-foreground)]">·</span>
          )}
          <AccountStatusBadge status={bankAccount.account_status ?? "Ouvert"} />
        </p>
        {ibanCountryCodes.length > 0 && (
          <p className="mt-0.5 text-xs font-medium text-[var(--muted-foreground)]">
            {ibanCountryCodes.join(" / ")}
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
        className="absolute right-2 top-12 z-50 min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <Link
          href={`/accounts/${bankAccount.id}`}
          onClick={onClose}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          <ExternalLinkIcon className="h-4 w-4" />
          Voir les informations du compte
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

function EditBankAccountModal({
  bankAccount,
  companies,
  banks,
  accountTypes,
  name,
  companyId,
  bankId,
  accountTypeId,
  accountStatus,
  telegramChatId,
  ibans,
  onNameChange,
  onCompanyIdChange,
  onBankIdChange,
  onAccountTypeIdChange,
  onAccountStatusChange,
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
  accountTypes: AccountType[];
  name: string;
  companyId: string;
  bankId: string;
  accountTypeId: string;
  accountStatus: AccountStatus;
  telegramChatId: string;
  ibans: IbanItem[];
  onNameChange: (v: string) => void;
  onCompanyIdChange: (v: string) => void;
  onBankIdChange: (v: string) => void;
  onAccountTypeIdChange: (v: string) => void;
  onAccountStatusChange: (v: AccountStatus) => void;
  onTelegramChatIdChange: (v: string) => void;
  onIbansChange: (v: IbanItem[]) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error?: string | null;
}) {
  const addIban = () => onIbansChange([...ibans, { iban: "", bic: undefined }]);
  const removeIban = (i: number) => onIbansChange(ibans.filter((_, idx) => idx !== i));
  const setIban = (i: number, iban: string) => {
    const next = [...ibans];
    next[i] = { ...next[i], iban };
    onIbansChange(next);
  };
  const setBic = (i: number, bic: string) => {
    const next = [...ibans];
    next[i] = { ...next[i], bic: bic || undefined };
    onIbansChange(next);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="subsection-header mb-4 text-lg font-medium">
          Modifier {displayName(bankAccount)}
        </h3>
        {error && (
          <div className="mb-4 rounded-lg border border-[var(--destructive-muted)] bg-[var(--destructive-muted)]/50 px-3 py-2 text-sm text-[var(--destructive)]">
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
          {accountTypes.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Type de compte</label>
              <select
                value={accountTypeId}
                onChange={(e) => onAccountTypeIdChange(e.target.value)}
                className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              >
                <option value="">Aucun type</option>
                {accountTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Statut du compte</label>
            <select
              value={accountStatus}
              onChange={(e) => onAccountStatusChange(e.target.value as AccountStatus)}
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              <option value="Ouvert">Ouvert</option>
              <option value="Fermé">Fermé</option>
              <option value="Problème">Problème</option>
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
                {ibans.map((item, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={item.iban}
                        onChange={(e) => setIban(i, e.target.value)}
                        placeholder="IBAN (ex. FR76 1234 5678 9012 3456 7890 123)"
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
                    <input
                      type="text"
                      value={item.bic ?? ""}
                      onChange={(e) => setBic(i, e.target.value)}
                      placeholder="BIC (optionnel)"
                      className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
                    />
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
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editBankId, setEditBankId] = useState("");
  const [editAccountTypeId, setEditAccountTypeId] = useState("");
  const [editAccountStatus, setEditAccountStatus] = useState<AccountStatus>("Ouvert");
  const [editTelegramChatId, setEditTelegramChatId] = useState("");
  const [editIbans, setEditIbans] = useState<IbanItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCompanyId, setCreateCompanyId] = useState("");
  const [createBankId, setCreateBankId] = useState("");
  const [createAccountTypeId, setCreateAccountTypeId] = useState("");
  const [createAccountStatus, setCreateAccountStatus] = useState<AccountStatus>("Ouvert");
  const [createIbans, setCreateIbans] = useState<IbanItem[]>([]);
  const [createLinkExistingGroupId, setCreateLinkExistingGroupId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createInviteWarning, setCreateInviteWarning] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bankAccountToDelete, setBankAccountToDelete] = useState<BankAccount | null>(null);
  const [search, setSearch] = useState("");
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);

  const filteredBankAccounts = useMemo(() => {
    let list = bankAccounts;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (ba) =>
          (ba.company_name ?? "").toLowerCase().includes(q) ||
          (ba.name ?? "").toLowerCase().includes(q)
      );
    }
    if (selectedBankId !== null) {
      if (selectedBankId === "") {
        list = list.filter((ba) => !ba.bank_id);
      } else {
        list = list.filter((ba) => ba.bank_id === selectedBankId);
      }
    }
    return list;
  }, [bankAccounts, search, selectedBankId]);

  const banksWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const bankNames = new Map<string, string>();
    const bankLogos = new Map<string, boolean>();
    banks.forEach((b) => {
      counts.set(b.id, 0);
      bankNames.set(b.id, b.name);
      bankLogos.set(b.id, !!b.has_logo);
    });
    counts.set("", 0);
    bankAccounts.forEach((ba) => {
      const key = ba.bank_id ?? "";
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (key && !bankNames.has(key)) bankNames.set(key, ba.bank_name ?? "Banque");
    });
    const result: { id: string; name: string; count: number; hasLogo?: boolean }[] = [];
    result.push({ id: "__all__", name: "Toutes les banques", count: bankAccounts.length, hasLogo: false });
    const bankIds = [...new Set([...banks.map((b) => b.id), ...bankAccounts.map((ba) => ba.bank_id).filter(Boolean)])] as string[];
    bankIds.forEach((bid) => {
      const c = counts.get(bid) ?? 0;
      if (c > 0) result.push({ id: bid, name: bankNames.get(bid) ?? "Banque", count: c, hasLogo: bankLogos.get(bid) });
    });
    const noBankCount = counts.get("") ?? 0;
    if (noBankCount > 0) result.push({ id: "", name: "Sans banque", count: noBankCount, hasLogo: false });
    return result;
  }, [banks, bankAccounts]);

  const fetchBankAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resBa, resCo, resBanks, resAccountTypes] = await Promise.all([
        fetch("/api/bank-accounts"),
        fetch("/api/accounts"),
        fetch("/api/banks"),
        fetch("/api/account-types"),
      ]);
      if (!resBa.ok) throw new Error("Échec du chargement des comptes");
      if (!resCo.ok) throw new Error("Échec du chargement des sociétés");
      const [dataBa, dataCo, dataBanks, dataAccountTypes] = await Promise.all([
        resBa.json(),
        resCo.json(),
        resBanks.ok ? resBanks.json() : Promise.resolve([]),
        resAccountTypes.ok ? resAccountTypes.json() : Promise.resolve([]),
      ]);
      setBankAccounts(dataBa);
      setCompanies(dataCo);
      setBanks(Array.isArray(dataBanks) ? dataBanks : []);
      setAccountTypes(Array.isArray(dataAccountTypes) ? dataAccountTypes : []);
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
        setEditAccountTypeId(account.account_type_id ?? "");
        setEditAccountStatus((account.account_status as AccountStatus) ?? "Ouvert");
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
    setEditAccountTypeId(ba.account_type_id ?? "");
    setEditAccountStatus((ba.account_status as AccountStatus) ?? "Ouvert");
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
      throw e;
    } finally {
      setDeletingId(null);
    }
  };

  const openCreateModal = () => {
    setCreateModalOpen(true);
    setCreateName("");
    setCreateCompanyId(companies[0]?.id ?? "");
    setCreateBankId("");
    setCreateAccountTypeId("");
    setCreateAccountStatus("Ouvert");
    setCreateIbans([]);
    setCreateLinkExistingGroupId("");
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
        .map((v) => ({
          iban: v.iban.trim().replace(/\s/g, "").toUpperCase(),
          bic: (v.bic ?? "").trim().replace(/\s/g, "").toUpperCase() || undefined,
        }))
        .filter((v) => v.iban.length > 0);
      const body: { name: string; company_id: string; bank_id?: string; account_type_id?: string; account_status?: AccountStatus; ibans: IbanItem[]; telegram_chat_id?: string } = {
        name,
        company_id: createCompanyId,
        ibans: ibansToSend,
      };
      if (createBankId) body.bank_id = createBankId;
      if (createAccountTypeId) body.account_type_id = createAccountTypeId;
      body.account_status = createAccountStatus;
      const linkId = createLinkExistingGroupId.trim();
      if (linkId && /^-?\d+$/.test(linkId)) body.telegram_chat_id = linkId;
      const res = await fetch("/api/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Échec de la création");
      }
      const created = data;
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
      const body: { name: string; company_id: string; bank_id?: string | null; account_type_id?: string | null; account_status?: AccountStatus; telegram_chat_id?: number; ibans?: IbanItem[] } = {
        name,
        company_id: editCompanyId,
      };
      body.bank_id = editBankId || null;
      body.account_type_id = editAccountTypeId || null;
      body.account_status = editAccountStatus;
      const tid = editTelegramChatId.trim();
      if (tid) {
        const num = parseInt(tid, 10);
        if (!Number.isNaN(num)) body.telegram_chat_id = num;
      }
      const ibansToSend = editIbans
        .map((v) => ({
          iban: v.iban.trim().replace(/\s/g, "").toUpperCase(),
          bic: (v.bic ?? "").trim().replace(/\s/g, "").toUpperCase() || undefined,
        }))
        .filter((v) => v.iban.length > 0);
      body.ibans = ibansToSend;
      const res = await fetch(`/api/bank-accounts/${editingAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Échec de la mise à jour");
      }
      const updated = data;
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
                account_type_id: updated.account_type_id ?? undefined,
                account_type_name: updated.account_type_name ?? undefined,
                account_status: updated.account_status ?? "Ouvert",
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
      <div className="flex flex-1 overflow-hidden">
        <main
          className={`min-w-0 flex-1 overflow-auto p-6 ${bankAccounts.length > 0 && banksWithCounts.length > 1 ? "lg:mr-56" : ""}`}
        >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary-muted)] text-[var(--primary)]">
              <BuildingIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="page-title text-2xl font-semibold">Comptes bancaires</h1>
              <p className="text-sm text-[var(--muted-foreground)]">Gérez vos comptes et transactions</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {bankAccounts.length > 0 && (
              <>
                <input
                  type="search"
                  placeholder="Rechercher par nom de compte ou société…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-64 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                  aria-label="Rechercher par nom de compte ou société"
                />
                {banksWithCounts.length > 1 && (
                  <select
                    value={selectedBankId ?? "__all__"}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedBankId(v === "__all__" ? null : v);
                    }}
                    className="lg:hidden rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    aria-label="Filtrer par banque"
                  >
                    {banksWithCounts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.count})
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
            {companies.length > 0 && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors shadow-sm"
              >
                <PlusIcon className="h-4 w-4" />
                Créer un compte
              </button>
            )}
          </div>
        </div>
        {error && !createModalOpen && !editingAccount && (
          <div className="mb-4 rounded-lg border border-[var(--destructive-muted)] bg-[var(--destructive-muted)]/50 px-3 py-2 text-sm text-[var(--destructive)]">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-[var(--muted-foreground)]">Chargement…</p>
        ) : bankAccounts.length === 0 ? (
          <p className="text-[var(--muted-foreground)]">Aucun compte.</p>
        ) : filteredBankAccounts.length === 0 ? (
          <p className="text-[var(--muted-foreground)]">
            Aucun compte ne correspond à « {search} ».
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {filteredBankAccounts.map((ba) => (
              <AccountCard
                key={ba.id}
                bankAccount={ba}
                menuOpen={menuOpenId === ba.id}
                onMenuToggle={() => setMenuOpenId((prev) => (prev === ba.id ? null : ba.id))}
                onEdit={openEdit}
                onDelete={(account) => {
                  setBankAccountToDelete(account);
                  setMenuOpenId(null);
                }}
                onCardClick={(account) => router.push(`/?bank_account_id=${encodeURIComponent(account.id)}`)}
                deleting={deletingId === ba.id}
              />
            ))}
          </div>
        )}
        </main>

        {bankAccounts.length > 0 && banksWithCounts.length > 1 && (
          <aside className="scrollbar-hide fixed right-0 top-0 z-30 hidden h-screen w-56 overflow-y-auto border-l border-[var(--border)] bg-[var(--muted)]/30 lg:block">
            <div className="sticky top-0 p-4">
              <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Filtrer par banque</h2>
              <nav className="space-y-1">
                {banksWithCounts.map((item) => {
                  const isActive =
                    item.id === "__all__"
                      ? selectedBankId === null
                      : item.id === ""
                        ? selectedBankId === ""
                        : selectedBankId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedBankId(item.id === "__all__" ? null : item.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? "bg-[var(--primary-muted)] text-[var(--primary)] font-medium"
                          : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      {item.id !== "__all__" && item.id !== "" && item.hasLogo ? (
                        <img
                          src={`/api/banks/${item.id}/files/logo`}
                          alt=""
                          className="h-6 w-6 shrink-0 rounded object-contain"
                        />
                      ) : (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--muted)] text-xs font-medium text-[var(--muted-foreground)]">
                          {item.id === "__all__" ? "⊕" : item.id === "" ? "—" : item.name.slice(0, 1)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <span className="shrink-0 text-xs tabular-nums opacity-70">{item.count}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>
        )}
      </div>

      {bankAccountToDelete && (
        <DeleteConfirmationModal
          title="Supprimer le compte bancaire"
          expectedText={`supprimer ${bankAccountToDelete.name} - ${bankAccountToDelete.company_name ?? ""}`}
          message="Cette action est irréversible."
          onConfirm={async () => {
            await handleDelete(bankAccountToDelete);
            setBankAccountToDelete(null);
          }}
          onClose={() => setBankAccountToDelete(null)}
          deleting={deletingId === bankAccountToDelete.id}
        />
      )}

      {editingAccount && (
        <EditBankAccountModal
          bankAccount={editingAccount}
          companies={companies}
          banks={banks}
          accountTypes={accountTypes}
          name={editName}
          companyId={editCompanyId}
          bankId={editBankId}
          accountTypeId={editAccountTypeId}
          accountStatus={editAccountStatus}
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
          onAccountTypeIdChange={(v) => {
            setEditAccountTypeId(v);
            setError(null);
          }}
          onAccountStatusChange={(v) => {
            setEditAccountStatus(v);
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
          accountTypes={accountTypes}
          name={createName}
          companyId={createCompanyId}
          bankId={createBankId}
          accountTypeId={createAccountTypeId}
          accountStatus={createAccountStatus}
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
          onAccountTypeIdChange={(v) => {
            setCreateAccountTypeId(v);
            setError(null);
          }}
          onAccountStatusChange={(v) => {
            setCreateAccountStatus(v);
            setError(null);
          }}
          onIbansChange={(v) => {
            setCreateIbans(v);
            setError(null);
          }}
          linkExistingGroupId={createLinkExistingGroupId}
          onLinkExistingGroupIdChange={(v) => {
            setCreateLinkExistingGroupId(v);
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
