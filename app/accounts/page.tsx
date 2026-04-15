"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccountNameField } from "@/components/AccountNameField";
import { BankSelect } from "@/components/BankSelect";
import { Select } from "@/components/Select";
import { AccountStatusBadge } from "@/components/AccountStatusBadge";
import { CreateBankAccountModal } from "@/components/CreateBankAccountModal";
import { TelegramBankAccountRattrapage } from "@/components/TelegramBankAccountRattrapage";
import { IbanCopyRows } from "@/components/IbanCopyRows";
import { DeleteConfirmationModal } from "@/components/DeleteConfirmationModal";
import { buildAutoBankAccountName } from "@/lib/bank-account-auto-name";
import { buildTelegramWelcomeDraft } from "@/lib/telegram-welcome-draft";
import { modalBackdropClose } from "@/lib/modal-backdrop-close";
import type { AccountStatus, AccountType, Bank, BankAccount, CardItem, Company, CompanyEmail, CompanyPhone, IbanItem } from "@/lib/types";

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

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 6 6 6-6 6" />
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

const BALANCE_FILTER_EPS = 1e-6;

/** Filtre société : source (catalogue) ou ancien champ texte `fournisseur`. */
function bankAccountFournisseurFacetKey(ba: BankAccount): string {
  if (ba.company_source_id) return `s:${ba.company_source_id}`;
  const leg = (ba.company_fournisseur ?? "").trim();
  if (leg) return `l:${encodeURIComponent(leg)}`;
  return "";
}

function bankAccountFournisseurFacetLabel(ba: BankAccount): string {
  const src = (ba.company_source_name ?? "").trim();
  if (src) return src;
  return (ba.company_fournisseur ?? "").trim();
}

function formatBalanceFilterEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "auto",
  }).format(n);
}

function balanceSliderStepFromSpan(span: number): number {
  const s = Math.abs(span);
  if (!Number.isFinite(s) || s < 1e-9) return 0.01;
  if (s > 500_000) return 1000;
  if (s > 50_000) return 100;
  if (s > 5_000) return 10;
  if (s > 500) return 1;
  return 0.01;
}

function BalanceAmountRangeControls({
  extent,
  rangeMin,
  rangeMax,
  step,
  onMinChange,
  onMaxChange,
}: {
  extent: { min: number; max: number };
  rangeMin: number;
  rangeMax: number;
  step: number;
  onMinChange: (v: number) => void;
  onMaxChange: (v: number) => void;
}) {
  if (extent.max - extent.min < 1e-9) return null;
  return (
    <div className="mt-4 w-full border-t border-[var(--border)] pt-4">
      <p className="mb-3 text-xs font-medium text-[var(--foreground)]">
        Fourchette de solde (€)
      </p>
      <div className="space-y-4">
        <div>
          <label className="mb-1 flex justify-between gap-2 text-xs text-[var(--muted-foreground)]">
            <span>Minimum</span>
            <span className="tabular-nums text-[var(--foreground)]">
              {formatBalanceFilterEur(rangeMin)}
            </span>
          </label>
          <input
            type="range"
            min={extent.min}
            max={extent.max}
            step={step}
            value={rangeMin}
            onChange={(e) => onMinChange(Number(e.target.value))}
            className="h-2 w-full cursor-pointer accent-[var(--primary)]"
            aria-label="Solde minimum"
          />
        </div>
        <div>
          <label className="mb-1 flex justify-between gap-2 text-xs text-[var(--muted-foreground)]">
            <span>Maximum</span>
            <span className="tabular-nums text-[var(--foreground)]">
              {formatBalanceFilterEur(rangeMax)}
            </span>
          </label>
          <input
            type="range"
            min={extent.min}
            max={extent.max}
            step={step}
            value={rangeMax}
            onChange={(e) => onMaxChange(Number(e.target.value))}
            className="h-2 w-full cursor-pointer accent-[var(--primary)]"
            aria-label="Solde maximum"
          />
        </div>
      </div>
    </div>
  );
}

function displayName(ba: BankAccount): string {
  return ba.company_name !== ba.name ? `${ba.name} – ${ba.company_name}` : ba.name;
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
  const fullIbans = getFullIbans(bankAccount.ibans);
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
      className="relative flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--card-shadow)] transition-all hover:shadow-[var(--card-hover-shadow)] hover:border-[var(--primary-muted-border)]"
      style={cardBgStyle}
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
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-[var(--foreground)]">{bankAccount.name}</h3>
            {bankAccount.company_name && (
              <p className="mt-0.5 truncate text-base font-medium text-[var(--muted-foreground)]">{bankAccount.company_name}</p>
            )}
          </div>
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
  accountStatuses,
  name,
  companyId,
  bankId,
  accountTypeId,
  accountStatusId,
  telegramChatId,
  ibans,
  login,
  password,
  pinCode,
  plafondLimit,
  cards,
  hasRib,
  onNameChange,
  onCompanyIdChange,
  onBankIdChange,
  onAccountTypeIdChange,
  onAccountStatusIdChange,
  onTelegramChatIdChange,
  onIbansChange,
  onLoginChange,
  onPasswordChange,
  onPinCodeChange,
  onPlafondLimitChange,
  onCardsChange,
  onRibUploaded,
  onSave,
  onClose,
  saving,
  error,
  companyEmails = [],
  companyPhones = [],
  companyEmailId = "",
  companyPhoneId = "",
  onCompanyEmailIdChange,
  onCompanyPhoneIdChange,
}: {
  bankAccount: BankAccount;
  companies: Company[];
  banks: Bank[];
  accountTypes: AccountType[];
  accountStatuses: AccountStatus[];
  name: string;
  companyId: string;
  bankId: string;
  accountTypeId: string;
  accountStatusId: string;
  telegramChatId: string;
  ibans: IbanItem[];
  login: string;
  password: string;
  pinCode: string;
  plafondLimit: string;
  cards: CardItem[];
  hasRib: boolean;
  onNameChange: (v: string) => void;
  onCompanyIdChange: (v: string) => void;
  onBankIdChange: (v: string) => void;
  onAccountTypeIdChange: (v: string) => void;
  onAccountStatusIdChange: (v: string) => void;
  onTelegramChatIdChange: (v: string) => void;
  onIbansChange: (v: IbanItem[]) => void;
  onLoginChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onPinCodeChange: (v: string) => void;
  onPlafondLimitChange: (v: string) => void;
  onCardsChange: (v: CardItem[]) => void;
  onRibUploaded: () => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error?: string | null;
  companyEmails?: CompanyEmail[];
  companyPhones?: CompanyPhone[];
  companyEmailId?: string;
  companyPhoneId?: string;
  onCompanyEmailIdChange?: (v: string) => void;
  onCompanyPhoneIdChange?: (v: string) => void;
}) {
  const [uploadingRib, setUploadingRib] = useState(false);
  const [ibanExpanded, setIbanExpanded] = useState(false);
  const [cardsExpanded, setCardsExpanded] = useState(false);
  const [ibanLookupLoading, setIbanLookupLoading] = useState<number | null>(null);
  const [ibanValidation, setIbanValidation] = useState<Record<string, boolean>>({});

  const telegramWelcomeDraft = useMemo(() => {
    const co = companies.find((c) => c.id === companyId);
    const companyName = (co?.name ?? bankAccount.company_name ?? "").trim();
    let emailStr = (bankAccount.company_email ?? "").trim();
    if (!emailStr && companyEmails.length > 0) {
      const picked = companyEmailId
        ? companyEmails.find((e) => e.id === companyEmailId)
        : undefined;
      emailStr = (
        picked?.email ??
        companyEmails.find((e) => e.is_default)?.email ??
        companyEmails[0]?.email ??
        ""
      ).trim();
    }
    const bank = banks.find((b) => b.id === bankId);
    const bankName = (bank?.name ?? bankAccount.bank_name ?? "").trim() || null;
    return buildTelegramWelcomeDraft({
      companyName,
      address: co?.address,
      codePostal: co?.code_postal,
      ville: co?.ville,
      email: emailStr || null,
      siret: co?.siret,
      directeur: co?.directeur,
      ibans,
      bankName,
    });
  }, [
    companies,
    companyId,
    bankAccount.company_name,
    bankAccount.company_email,
    bankAccount.bank_name,
    companyEmails,
    companyEmailId,
    banks,
    bankId,
    ibans,
  ]);

  const lookupIbanBic = async (index: number) => {
    const item = ibans[index];
    const raw = (item?.iban ?? "").trim().replace(/\s/g, "").toUpperCase();
    if (raw.length < 15) return;
    setIbanLookupLoading(index);
    try {
      const res = await fetch(`/api/iban/validate?iban=${encodeURIComponent(raw)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      let data: { valid?: boolean; swift_code?: string | null } = {};
      try {
        data = (await res.json()) as { valid?: boolean; swift_code?: string | null };
      } catch {
        setIbanValidation((prev) => ({ ...prev, [raw]: false }));
        return;
      }
      if (!res.ok) {
        setIbanValidation((prev) => ({ ...prev, [raw]: false }));
        return;
      }
      const valid = !!data?.valid;
      setIbanValidation((prev) => ({ ...prev, [raw]: valid }));
      const swiftCode = typeof data?.swift_code === "string" ? data.swift_code.trim() : "";
      if (valid && swiftCode) {
        const next = [...ibans];
        next[index] = { ...next[index], bic: swiftCode };
        onIbansChange(next);
        const bic8 = swiftCode.toUpperCase().slice(0, 8);
        const matchedBank = banks.find((b) => {
          const dbBic = (b.bic ?? "").trim().toUpperCase();
          return dbBic.length >= 8 && dbBic.slice(0, 8) === bic8;
        });
        if (matchedBank) onBankIdChange(matchedBank.id);
      }
    } finally {
      setIbanLookupLoading(null);
    }
  };

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
  const addCard = () => onCardsChange([...cards, { numero: "", date_expiration: undefined, cvv: undefined }]);
  const removeCard = (i: number) => onCardsChange(cards.filter((_, idx) => idx !== i));
  const setCard = (i: number, field: "numero" | "date_expiration" | "cvv", value: string) => {
    const next = [...cards];
    next[i] = { ...next[i], [field]: value || undefined };
    onCardsChange(next);
  };

  const lastSyncedNameDepsKeyRef = useRef<string>("");
  useEffect(() => {
    lastSyncedNameDepsKeyRef.current = "";
  }, [bankAccount.id]);

  useEffect(() => {
    const typeId = (accountTypeId ?? "").toString().trim().toLowerCase();
    const accType = typeId ? accountTypes.find((t) => String(t?.id ?? "").trim().toLowerCase() === typeId) : undefined;
    const typeEmoji = (accType?.emoji ?? "").toString().trim().replace(/\s/g, "");
    const statusId = (accountStatusId ?? "").toString().trim().toLowerCase();
    const status = statusId ? accountStatuses.find((s) => String(s?.id ?? "").trim().toLowerCase() === statusId) : undefined;
    const statusEmoji = (status?.emoji ?? "").toString().trim().replace(/\s/g, "");
    const firstIban = ibans.find((i) => (i?.iban ?? "").trim().length > 0);
    const rawIban = (firstIban?.iban ?? "").trim().replace(/\s/g, "").toUpperCase();
    const iban2 = rawIban.slice(0, 2);
    const bank = banks.find((b) => b.id === bankId);
    const bankName = (bank?.name ?? "").trim();
    const company = companies.find((c) => c.id === companyId);
    const companyName = (company?.name ?? "").trim();
    const midPart = iban2 && bankName ? `${iban2}_${bankName}` : iban2 || bankName || "";
    const autoName = buildAutoBankAccountName(typeEmoji, statusEmoji, midPart, companyName, bankName);
    if (!autoName) return;
    const key = JSON.stringify({
      t: accountTypeId,
      s: accountStatusId,
      b: bankId,
      c: companyId,
      i: ibans.map((row) => (row?.iban ?? "").trim().replace(/\s/g, "").toUpperCase()),
    });
    if (key === lastSyncedNameDepsKeyRef.current) return;
    lastSyncedNameDepsKeyRef.current = key;
    onNameChange(autoName);
  }, [
    bankAccount.id,
    accountTypeId,
    accountStatusId,
    bankId,
    companyId,
    ibans,
    accountTypes,
    accountStatuses,
    banks,
    companies,
    onNameChange,
  ]);

  const handleRibUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingRib(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "rib");
      const res = await fetch(`/api/bank-accounts/${bankAccount.id}/files`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de l'upload");
      }
      onRibUploaded();
    } finally {
      setUploadingRib(false);
      e.target.value = "";
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => modalBackdropClose(e, onClose)}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 p-6 pb-0">
        <h3 className="subsection-header text-lg font-medium">
          Modifier {displayName(bankAccount)}
        </h3>
        {error && (
          <div className="mb-4 rounded-lg border border-[var(--destructive-muted)] bg-[var(--destructive-muted)]/50 px-3 py-2 text-sm text-[var(--destructive)]">
            {error}
          </div>
        )}
        </div>
        <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-3 gap-x-4 gap-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Client</label>
            <Select
              value={accountTypeId}
              onChange={(e) => onAccountTypeIdChange(e.target.value)}
            >
              <option value="">Aucun client</option>
              {accountTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            {accountTypes.length === 0 && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Aucun client configuré. Paramètres → Clients
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Statut du compte</label>
            <Select
              value={accountStatusId}
              onChange={(e) => onAccountStatusIdChange(e.target.value)}
            >
              <option value="">Sélectionner un statut</option>
              {accountStatuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            {accountStatuses.length === 0 && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Aucun statut configuré. Paramètres → Statuts de comptes
              </p>
            )}
          </div>
          <div className="col-span-3">
            <div className="rounded-lg border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setIbanExpanded((e) => !e)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[var(--muted)]/50"
              >
                <span className="text-sm font-medium text-[var(--foreground)]">
                  IBAN {ibans.length > 0 && <span className="text-[var(--muted-foreground)]">({ibans.length})</span>}
                </span>
                <span className="text-[var(--muted-foreground)]">
                  {ibanExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                </span>
              </button>
              {ibanExpanded && (
              <div className="border-t border-[var(--border)] p-3">
              <div className="mb-2 flex justify-end">
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
                          onBlur={() => lookupIbanBic(i)}
                          placeholder="IBAN (ex. FR76 1234 5678 9012 3456 7890 123)"
                          className="block flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => lookupIbanBic(i)}
                          disabled={ibanLookupLoading !== null || (item?.iban ?? "").trim().replace(/\s/g, "").length < 15}
                          className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {ibanLookupLoading === i ? "…" : "Vérifier"}
                        </button>
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
                        placeholder="BIC (optionnel, auto-rempli si IBAN valide)"
                        className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
                      />
                      {ibanLookupLoading === i ? (
                        <span className="text-xs text-[var(--muted-foreground)]">Vérification…</span>
                      ) : (() => {
                        const raw = (item?.iban ?? "").trim().replace(/\s/g, "").toUpperCase();
                        const valid = raw.length >= 15 ? ibanValidation[raw] : undefined;
                        if (valid === true) return <span className="text-xs text-[var(--success)]">IBAN correct</span>;
                        if (valid === false) return <span className="text-xs text-[var(--destructive)]">IBAN incorrect</span>;
                        return null;
                      })()}
                    </div>
                  ))}
                </div>
              )}
              </div>
              )}
            </div>
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
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Société</label>
            <Select
              value={companyId}
              onChange={(e) => onCompanyIdChange(e.target.value)}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom du compte</label>
            <AccountNameField
              value={name}
              onChange={onNameChange}
              placeholder="Ex. Compte courant"
              autoFocus
            />
          </div>
          <div className="col-span-3">
            <div className="rounded-lg border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setCardsExpanded((e) => !e)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[var(--muted)]/50"
              >
                <span className="text-sm font-medium text-[var(--foreground)]">
                  Cartes bleues {cards.length > 0 && <span className="text-[var(--muted-foreground)]">({cards.length})</span>}
                </span>
                <span className="text-[var(--muted-foreground)]">
                  {cardsExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                </span>
              </button>
              {cardsExpanded && (
              <div className="border-t border-[var(--border)] p-3">
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={addCard}
                  className="text-xs text-[var(--primary)] hover:underline"
                >
                  + Ajouter une carte
                </button>
              </div>
              {cards.length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)]">Aucune carte.</p>
              ) : (
                <div className="space-y-2">
                  {cards.map((item, i) => (
                    <div key={i} className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={item.numero}
                          onChange={(e) => setCard(i, "numero", e.target.value)}
                          placeholder="Numéro (ex. 1234 5678 9012 3456)"
                          className="block flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => removeCard(i)}
                          className="rounded-lg border border-[var(--border)] px-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                        >
                          ×
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={item.date_expiration ?? ""}
                          onChange={(e) => setCard(i, "date_expiration", e.target.value)}
                          placeholder="MM/AA"
                          className="block w-24 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
                        />
                        <input
                          type="text"
                          value={item.cvv ?? ""}
                          onChange={(e) => setCard(i, "cvv", e.target.value)}
                          placeholder="CVV"
                          className="block w-20 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </div>
              )}
            </div>
          </div>
          {companyEmails.length > 0 && onCompanyEmailIdChange && (
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Email de la société</label>
              <Select
                value={companyEmailId || (companyEmails.find((e) => e.is_default)?.id ?? companyEmails[0]?.id ?? "")}
                onChange={(e) => onCompanyEmailIdChange(e.target.value)}
              >
                <option value="">Aucun</option>
                {companyEmails.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.email}{e.is_default ? " ★" : ""}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {companyPhones.length > 0 && onCompanyPhoneIdChange && (
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Téléphone de la société</label>
              <Select
                value={companyPhoneId || (companyPhones.find((p) => p.is_default)?.id ?? companyPhones[0]?.id ?? "")}
                onChange={(e) => onCompanyPhoneIdChange(e.target.value)}
              >
                <option value="">Aucun</option>
                {companyPhones.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.phone}
                    {p.operateur ? ` — ${p.operateur}` : ""}
                    {p.is_default ? " ★" : ""}
                  </option>
                ))}
              </Select>
            </div>
          )}
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

          <TelegramBankAccountRattrapage
            bankAccountId={bankAccount.id}
            accountName={name}
            telegramChatId={telegramChatId}
            hasBankLogo={!!bankAccount.has_logo}
            hasRib={hasRib}
            companyId={companyId}
            welcomeDraft={telegramWelcomeDraft}
          />

          <div className="col-span-3">
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Identifiants</label>
            <form
              className="contents"
              autoComplete="off"
              onSubmit={(e) => e.preventDefault()}
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  name="bb_bank_portal_login"
                  value={login}
                  onChange={(e) => onLoginChange(e.target.value)}
                  placeholder="Login"
                  autoComplete="off"
                  className="block flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  name="bb_bank_portal_password"
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  placeholder="Mot de passe"
                  autoComplete="new-password"
                  className="block flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  name="bb_bank_portal_pin"
                  value={pinCode}
                  onChange={(e) => onPinCodeChange(e.target.value)}
                  placeholder="Code PIN"
                  autoComplete="off"
                  className="block flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
            </form>
          </div>

          <div className="col-span-3">
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Plafond / limite</label>
            <input
              type="text"
              value={plafondLimit}
              onChange={(e) => onPlafondLimitChange(e.target.value)}
              placeholder="Ex. 5000 €"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>

          <div className="col-span-3">
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">RIB (document)</label>
            {hasRib ? (
              <div className="flex items-center gap-2">
                <a
                  href={`/api/bank-accounts/${bankAccount.id}/files/rib`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--primary)] hover:underline"
                >
                  Voir le RIB
                </a>
                <span className="text-xs text-[var(--muted-foreground)]">·</span>
                <label className="cursor-pointer text-sm text-[var(--primary)] hover:underline">
                  {uploadingRib ? "Upload…" : "Remplacer"}
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    disabled={uploadingRib}
                    onChange={handleRibUpload}
                  />
                </label>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-start gap-2 rounded-lg border border-dashed border-[var(--border)] p-4 py-3">
                <span className="text-sm text-[var(--muted-foreground)]">
                  {uploadingRib ? "Upload…" : "Choisir un fichier (PDF ou image)"}
                </span>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  disabled={uploadingRib}
                  onChange={handleRibUpload}
                />
              </label>
            )}
          </div>
        </div>
        </div>
        <div className="shrink-0 border-t border-[var(--border)] p-6 pt-4">
        <div className="flex justify-end gap-2">
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
    </div>
  );
}

function AccountsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editIdFromUrl = searchParams.get("edit");
  const companyFromUrl = searchParams.get("company");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [accountStatuses, setAccountStatuses] = useState<AccountStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editBankId, setEditBankId] = useState("");
  const [editAccountTypeId, setEditAccountTypeId] = useState("");
  const [editAccountStatusId, setEditAccountStatusId] = useState("");
  const [editTelegramChatId, setEditTelegramChatId] = useState("");
  const [editIbans, setEditIbans] = useState<IbanItem[]>([]);
  const [editLogin, setEditLogin] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editPinCode, setEditPinCode] = useState("");
  const [editPlafondLimit, setEditPlafondLimit] = useState("");
  const [editCards, setEditCards] = useState<CardItem[]>([]);
  const [editHasRib, setEditHasRib] = useState(false);
  const [editCompanyEmailId, setEditCompanyEmailId] = useState("");
  const [editCompanyPhoneId, setEditCompanyPhoneId] = useState("");
  const [editCompanyEmails, setEditCompanyEmails] = useState<CompanyEmail[]>([]);
  const [editCompanyPhones, setEditCompanyPhones] = useState<CompanyPhone[]>([]);
  const [saving, setSaving] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCompanyId, setCreateCompanyId] = useState("");
  const [createBankId, setCreateBankId] = useState("");
  const [createAccountTypeId, setCreateAccountTypeId] = useState("");
  const [createAccountStatusId, setCreateAccountStatusId] = useState("");
  const [createIbans, setCreateIbans] = useState<IbanItem[]>([]);
  const [createLogin, setCreateLogin] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createPinCode, setCreatePinCode] = useState("");
  const [createPlafondLimit, setCreatePlafondLimit] = useState("");
  const [createCards, setCreateCards] = useState<CardItem[]>([]);
  const [createLinkTelegramEnabled, setCreateLinkTelegramEnabled] = useState(true);
  const [createPostTelegram, setCreatePostTelegram] = useState<{
    accountId: string;
    accountName: string;
    telegramChatId: string;
    hasBankLogo: boolean;
    hasRib: boolean;
    companyId: string;
    welcomeDraft: string;
  } | null>(null);
  const [createLinkExistingGroupId, setCreateLinkExistingGroupId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createInviteWarning, setCreateInviteWarning] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bankAccountToDelete, setBankAccountToDelete] = useState<BankAccount | null>(null);
  const [search, setSearch] = useState("");
  const [accountsSortMode, setAccountsSortMode] = useState<
    "alpha" | "balance_asc" | "balance_desc" | "status"
  >("alpha");
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [accountsFilterPanel, setAccountsFilterPanel] = useState<
    "hub" | "banks" | "status" | "fournisseur" | "client" | "balance"
  >("hub");
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null);
  /** Type de compte (« Client » dans création / édition compte) = `account_type_id`. */
  const [selectedAccountTypeFilterId, setSelectedAccountTypeFilterId] = useState<string | null>(
    null
  );
  /** null = tous ; "" = sans source ni texte ; sinon `s:uuid` ou `l:` + encodeURIComponent(texte) */
  const [selectedFournisseurKey, setSelectedFournisseurKey] = useState<string | null>(null);
  const [balanceBucket, setBalanceBucket] = useState<"all" | "negative" | "zero" | "positive">("all");

  const balanceExtent = useMemo(() => {
    if (bankAccounts.length === 0) return { min: 0, max: 0 };
    let minV = Infinity;
    let maxV = -Infinity;
    for (const ba of bankAccounts) {
      const b = ba.balance ?? 0;
      if (b < minV) minV = b;
      if (b > maxV) maxV = b;
    }
    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return { min: 0, max: 0 };
    if (Math.abs(maxV - minV) < BALANCE_FILTER_EPS) {
      const pad = Math.max(100, Math.abs(minV) * 0.05 + 1);
      minV -= pad;
      maxV += pad;
    }
    return { min: minV, max: maxV };
  }, [bankAccounts]);

  const [balanceRangeMin, setBalanceRangeMin] = useState(0);
  const [balanceRangeMax, setBalanceRangeMax] = useState(0);

  useEffect(() => {
    setBalanceRangeMin(balanceExtent.min);
    setBalanceRangeMax(balanceExtent.max);
  }, [balanceExtent.min, balanceExtent.max]);

  const balanceSliderStep = useMemo(
    () => balanceSliderStepFromSpan(balanceExtent.max - balanceExtent.min),
    [balanceExtent.min, balanceExtent.max]
  );

  const balanceRangeFilterActive = useMemo(() => {
    if (bankAccounts.length === 0) return false;
    const span = balanceExtent.max - balanceExtent.min;
    const tol = Math.max(0.01, span * 1e-9);
    return (
      balanceRangeMin > balanceExtent.min + tol ||
      balanceRangeMax < balanceExtent.max - tol
    );
  }, [
    bankAccounts.length,
    balanceExtent.min,
    balanceExtent.max,
    balanceRangeMin,
    balanceRangeMax,
  ]);

  const onBalanceRangeMinChange = useCallback(
    (v: number) => {
      const x = Math.min(Math.max(v, balanceExtent.min), balanceExtent.max);
      setBalanceRangeMin(x);
      setBalanceRangeMax((prev) => (x > prev ? x : prev));
    },
    [balanceExtent.min, balanceExtent.max]
  );

  const onBalanceRangeMaxChange = useCallback(
    (v: number) => {
      const x = Math.min(Math.max(v, balanceExtent.min), balanceExtent.max);
      setBalanceRangeMax(x);
      setBalanceRangeMin((prev) => (x < prev ? x : prev));
    },
    [balanceExtent.min, balanceExtent.max]
  );

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
    if (selectedStatusId !== null) {
      list = list.filter((ba) => ba.account_status_id === selectedStatusId);
    }
    if (selectedAccountTypeFilterId !== null) {
      if (selectedAccountTypeFilterId === "") {
        list = list.filter((ba) => !ba.account_type_id);
      } else {
        list = list.filter((ba) => ba.account_type_id === selectedAccountTypeFilterId);
      }
    }
    if (selectedFournisseurKey !== null) {
      if (selectedFournisseurKey === "") {
        list = list.filter((ba) => bankAccountFournisseurFacetKey(ba) === "");
      } else if (selectedFournisseurKey.startsWith("s:")) {
        const id = selectedFournisseurKey.slice(2);
        list = list.filter((ba) => ba.company_source_id === id);
      } else if (selectedFournisseurKey.startsWith("l:")) {
        let raw: string;
        try {
          raw = decodeURIComponent(selectedFournisseurKey.slice(2));
        } catch {
          raw = selectedFournisseurKey.slice(2);
        }
        list = list.filter(
          (ba) =>
            !ba.company_source_id &&
            (ba.company_fournisseur ?? "").trim() === raw
        );
      }
    }
    if (balanceBucket !== "all") {
      list = list.filter((ba) => {
        const bal = ba.balance ?? 0;
        if (balanceBucket === "negative") return bal < -BALANCE_FILTER_EPS;
        if (balanceBucket === "zero") return Math.abs(bal) < BALANCE_FILTER_EPS;
        if (balanceBucket === "positive") return bal > BALANCE_FILTER_EPS;
        return true;
      });
    }
    if (balanceRangeFilterActive) {
      list = list.filter((ba) => {
        const bal = ba.balance ?? 0;
        return bal >= balanceRangeMin - 1e-9 && bal <= balanceRangeMax + 1e-9;
      });
    }
    return list;
  }, [
    bankAccounts,
    search,
    selectedBankId,
    selectedStatusId,
    selectedAccountTypeFilterId,
    selectedFournisseurKey,
    balanceBucket,
    balanceRangeFilterActive,
    balanceRangeMin,
    balanceRangeMax,
  ]);

  const accountStatusSortOrder = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of accountStatuses) {
      m.set(s.id, s.sort_order);
    }
    return m;
  }, [accountStatuses]);

  const sortedBankAccounts = useMemo(() => {
    const list = [...filteredBankAccounts];
    const cmpName = (a: BankAccount, b: BankAccount) => {
      const na = displayName(a).toLowerCase();
      const nb = displayName(b).toLowerCase();
      return na.localeCompare(nb, "fr");
    };
    switch (accountsSortMode) {
      case "alpha":
        list.sort(cmpName);
        break;
      case "balance_asc":
        list.sort((a, b) => {
          const d = (a.balance ?? 0) - (b.balance ?? 0);
          if (d !== 0) return d;
          return cmpName(a, b);
        });
        break;
      case "balance_desc":
        list.sort((a, b) => {
          const d = (b.balance ?? 0) - (a.balance ?? 0);
          if (d !== 0) return d;
          return cmpName(a, b);
        });
        break;
      case "status": {
        const rank = (ba: BankAccount) => {
          if (!ba.account_status_id) return 99_999;
          return accountStatusSortOrder.get(ba.account_status_id) ?? 9_999;
        };
        list.sort((a, b) => {
          const ra = rank(a);
          const rb = rank(b);
          if (ra !== rb) return ra - rb;
          const ns = (a.account_status_name ?? "").localeCompare(
            b.account_status_name ?? "",
            "fr"
          );
          if (ns !== 0) return ns;
          return cmpName(a, b);
        });
        break;
      }
      default:
        break;
    }
    return list;
  }, [filteredBankAccounts, accountsSortMode, accountStatusSortOrder]);

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

  const statusesWithCounts = useMemo(() => {
    const m = new Map<
      string,
      { id: string; name: string; emoji?: string | null; count: number }
    >();
    for (const ba of bankAccounts) {
      const id = ba.account_status_id;
      if (!id) continue;
      const cur = m.get(id);
      if (cur) cur.count += 1;
      else
        m.set(id, {
          id,
          name: ba.account_status_name ?? "—",
          emoji: ba.account_status_emoji,
          count: 1,
        });
    }
    const rows = [...m.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "fr")
    );
    return [
      {
        id: "__all__" as const,
        name: "Tous les statuts",
        emoji: null as string | null,
        count: bankAccounts.length,
      },
      ...rows,
    ];
  }, [bankAccounts]);

  const accountTypesWithFilterCounts = useMemo(() => {
    const m = new Map<
      string,
      { id: string; name: string; emoji?: string | null; count: number }
    >();
    let sansClient = 0;
    for (const ba of bankAccounts) {
      const id = ba.account_type_id;
      if (!id) {
        sansClient += 1;
        continue;
      }
      const cur = m.get(id);
      if (cur) cur.count += 1;
      else
        m.set(id, {
          id,
          name: ba.account_type_name ?? "—",
          emoji: ba.account_type_emoji,
          count: 1,
        });
    }
    const rows = [...m.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "fr")
    );
    const result: { id: string; name: string; emoji?: string | null; count: number }[] = [
      {
        id: "__all__",
        name: "Tous les clients",
        emoji: null as string | null,
        count: bankAccounts.length,
      },
    ];
    if (sansClient > 0) {
      result.push({
        id: "",
        name: "Aucun client",
        emoji: null,
        count: sansClient,
      });
    }
    result.push(...rows);
    return result;
  }, [bankAccounts]);

  const fournisseursWithCounts = useMemo(() => {
    const meta = new Map<string, { label: string; count: number }>();
    for (const ba of bankAccounts) {
      const key = bankAccountFournisseurFacetKey(ba);
      const label =
        key === ""
          ? "Sans source ni fournisseur (société)"
          : bankAccountFournisseurFacetLabel(ba);
      const cur = meta.get(key);
      if (cur) cur.count += 1;
      else meta.set(key, { label, count: 1 });
    }
    const keys = [...meta.keys()].filter((k) => k !== "").sort((a, b) => {
      const la = meta.get(a)!.label;
      const lb = meta.get(b)!.label;
      return la.localeCompare(lb, "fr");
    });
    const rows: { key: string; label: string; count: number }[] = [
      {
        key: "__all__",
        label: "Tous les fournisseurs / sources",
        count: bankAccounts.length,
      },
    ];
    if (meta.has("")) {
      rows.push({
        key: "",
        label: "Sans source ni fournisseur (société)",
        count: meta.get("")!.count,
      });
    }
    for (const key of keys) {
      const m = meta.get(key)!;
      rows.push({ key, label: m.label, count: m.count });
    }
    return rows;
  }, [bankAccounts]);

  const balanceBucketsWithCounts = useMemo(() => {
    let neg = 0;
    let zero = 0;
    let pos = 0;
    for (const ba of bankAccounts) {
      const bal = ba.balance ?? 0;
      if (bal < -BALANCE_FILTER_EPS) neg += 1;
      else if (bal > BALANCE_FILTER_EPS) pos += 1;
      else zero += 1;
    }
    return [
      { id: "all" as const, label: "Tous les soldes", count: bankAccounts.length },
      { id: "negative" as const, label: "Solde négatif", count: neg },
      { id: "zero" as const, label: "Solde nul", count: zero },
      { id: "positive" as const, label: "Solde positif", count: pos },
    ];
  }, [bankAccounts]);

  const hasActiveAccountFilters =
    selectedBankId !== null ||
    selectedStatusId !== null ||
    selectedAccountTypeFilterId !== null ||
    selectedFournisseurKey !== null ||
    balanceBucket !== "all" ||
    balanceRangeFilterActive;

  const resetAccountFilters = useCallback(() => {
    setSelectedBankId(null);
    setSelectedStatusId(null);
    setSelectedAccountTypeFilterId(null);
    setSelectedFournisseurKey(null);
    setBalanceBucket("all");
    setBalanceRangeMin(balanceExtent.min);
    setBalanceRangeMax(balanceExtent.max);
    setAccountsFilterPanel("hub");
  }, [balanceExtent.min, balanceExtent.max]);

  const fetchBankAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resBa, resCo, resBanks, resAccountTypes, resAccountStatuses] = await Promise.all([
        fetch("/api/bank-accounts"),
        fetch("/api/accounts"),
        fetch("/api/banks"),
        fetch("/api/account-types"),
        fetch("/api/account-statuses"),
      ]);
      if (!resBa.ok) throw new Error("Échec du chargement des comptes");
      if (!resCo.ok) throw new Error("Échec du chargement des sociétés");
      const [dataBa, dataCo, dataBanks, dataAccountTypes, dataAccountStatuses] = await Promise.all([
        resBa.json(),
        resCo.json(),
        resBanks.ok ? resBanks.json() : Promise.resolve([]),
        resAccountTypes.ok ? resAccountTypes.json() : Promise.resolve([]),
        resAccountStatuses.ok ? resAccountStatuses.json() : Promise.resolve([]),
      ]);
      setBankAccounts(dataBa);
      setCompanies(dataCo);
      setBanks(Array.isArray(dataBanks) ? dataBanks : []);
      setAccountTypes(Array.isArray(dataAccountTypes) ? dataAccountTypes : []);
      setAccountStatuses(Array.isArray(dataAccountStatuses) ? dataAccountStatuses : []);
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
    if (!editCompanyId && !editingAccount) return;
    const cid = editCompanyId || editingAccount?.company_id;
    if (!cid) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/accounts/${cid}/emails`),
      fetch(`/api/accounts/${cid}/phones`),
    ]).then(async ([rEm, rPh]) => {
      if (cancelled) return;
      const parseEmails = async (): Promise<CompanyEmail[]> => {
        if (!rEm.ok) return [];
        try {
          const data = await rEm.json();
          return Array.isArray(data) ? data : [];
        } catch {
          return [];
        }
      };
      const parsePhones = async (): Promise<CompanyPhone[]> => {
        if (!rPh.ok) return [];
        try {
          const data = await rPh.json();
          return Array.isArray(data) ? data : [];
        } catch {
          return [];
        }
      };
      const [emails, phones] = await Promise.all([parseEmails(), parsePhones()]);
      if (cancelled) return;
      setEditCompanyEmails(emails);
      setEditCompanyPhones(phones);
      if (!editingAccount?.company_email_id && emails.length > 0) {
        const def = emails.find((e) => e.is_default) ?? emails[0];
        setEditCompanyEmailId(def?.id ?? "");
      }
      if (!editingAccount?.company_phone_id && phones.length > 0) {
        const def = phones.find((p) => p.is_default) ?? phones[0];
        setEditCompanyPhoneId(def?.id ?? "");
      }
    });
    return () => { cancelled = true; };
  }, [editCompanyId, editingAccount?.company_id, editingAccount?.company_email_id, editingAccount?.company_phone_id]);

  useEffect(() => {
    if (editIdFromUrl && bankAccounts.length > 0) {
      const account = bankAccounts.find((ba) => ba.id === editIdFromUrl);
      if (account) {
        setEditingAccount(account);
        setEditName(account.name);
        setEditCompanyId(account.company_id);
        setEditBankId(account.bank_id ?? "");
        setEditAccountTypeId(account.account_type_id ?? "");
        setEditAccountStatusId(account.account_status_id ?? "");
        setEditTelegramChatId(String(account.telegram_chat_id ?? ""));
        setEditIbans(account.ibans ?? []);
        setEditLogin(account.login ?? "");
        setEditPassword(account.password ?? "");
        setEditPinCode(account.pin_code ?? "");
        setEditPlafondLimit(account.plafond_limit ?? "");
        setEditCards(account.cards ?? []);
        setEditHasRib(!!account.has_rib);
        setEditCompanyEmailId(account.company_email_id ?? "");
        setEditCompanyPhoneId(account.company_phone_id ?? "");
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
    setEditAccountStatusId(ba.account_status_id ?? "");
    setEditTelegramChatId(String(ba.telegram_chat_id ?? ""));
    setEditIbans(ba.ibans ?? []);
    setEditLogin(ba.login ?? "");
    setEditPassword(ba.password ?? "");
    setEditPinCode(ba.pin_code ?? "");
    setEditPlafondLimit(ba.plafond_limit ?? "");
    setEditCards(ba.cards ?? []);
    setEditHasRib(!!ba.has_rib);
    setEditCompanyEmailId(ba.company_email_id ?? "");
    setEditCompanyPhoneId(ba.company_phone_id ?? "");
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

  const openCreateModal = useCallback(
    (preferredCompanyId?: string) => {
      setCreateModalOpen(true);
      setCreateName("");
      const cid =
        preferredCompanyId && companies.some((c) => c.id === preferredCompanyId)
          ? preferredCompanyId
          : (companies[0]?.id ?? "");
      setCreateCompanyId(cid);
      setCreateBankId("");
      setCreateAccountTypeId("");
      const sortedStatuses = [...accountStatuses].sort((a, b) => a.sort_order - b.sort_order);
      setCreateAccountStatusId(sortedStatuses[3]?.id ?? "");
      setCreateIbans([]);
      setCreateLogin("");
      setCreatePassword("");
      setCreatePinCode("");
      setCreatePlafondLimit("");
      setCreateCards([]);
      setCreateLinkTelegramEnabled(true);
      setCreateLinkExistingGroupId("");
      setCreatePostTelegram(null);
      setError(null);
      setCreateInviteWarning(null);
    },
    [companies, accountStatuses]
  );

  const createFromCompanyUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!companyFromUrl) {
      createFromCompanyUrlRef.current = null;
      return;
    }
    if (loading) return;
    if (!companies.some((c) => c.id === companyFromUrl)) return;
    if (createFromCompanyUrlRef.current === companyFromUrl) return;
    createFromCompanyUrlRef.current = companyFromUrl;
    openCreateModal(companyFromUrl);
    router.replace("/accounts", { scroll: false });
  }, [companyFromUrl, loading, companies, openCreateModal, router]);

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    setError(null);
    setCreateInviteWarning(null);
    setCreatePostTelegram(null);
  };

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name || !createCompanyId) return;
    if (createLinkTelegramEnabled) {
      const linkId = createLinkExistingGroupId.trim();
      if (!linkId || !/^-?\d+$/.test(linkId)) {
        setError(
          "Indiquez un ID de groupe Telegram valide (nombre, ex. -100…), ou décochez « Lier un groupe Telegram existant » pour créer le compte uniquement dans le CRM."
        );
        return;
      }
    }
    setCreating(true);
    setError(null);
    try {
      const ibansToSend = createIbans
        .map((v) => ({
          iban: v.iban.trim().replace(/\s/g, "").toUpperCase(),
          bic: (v.bic ?? "").trim().replace(/\s/g, "").toUpperCase() || undefined,
        }))
        .filter((v) => v.iban.length > 0);
      const cardsToSend = createCards
        .map((v) => ({
          numero: v.numero.trim().replace(/\s/g, ""),
          date_expiration: (v.date_expiration ?? "").trim() || undefined,
          cvv: (v.cvv ?? "").trim() || undefined,
        }))
        .filter((v) => v.numero.length > 0);
      const body: {
        name: string;
        company_id: string;
        bank_id?: string;
        account_type_id?: string;
        account_status_id?: string;
        ibans: IbanItem[];
        login?: string;
        password?: string;
        pin_code?: string;
        plafond_limit?: string;
        cards?: CardItem[];
        telegram_chat_id?: string;
        skip_telegram?: boolean;
      } = {
        name,
        company_id: createCompanyId,
        ibans: ibansToSend,
      };
      if (createBankId) body.bank_id = createBankId;
      if (createAccountTypeId) body.account_type_id = createAccountTypeId;
      if (createAccountStatusId) body.account_status_id = createAccountStatusId;
      if (createLogin.trim()) body.login = createLogin.trim();
      if (createPassword.trim()) body.password = createPassword.trim();
      if (createPinCode.trim()) body.pin_code = createPinCode.trim();
      if (createPlafondLimit.trim()) body.plafond_limit = createPlafondLimit.trim();
      if (cardsToSend.length > 0) body.cards = cardsToSend;
      if (createLinkTelegramEnabled) {
        body.telegram_chat_id = createLinkExistingGroupId.trim();
      } else {
        body.skip_telegram = true;
      }
      const res = await fetch("/api/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const rawText = await res.text();
      let data: unknown = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error(
          res.ok
            ? "Réponse serveur invalide (non-JSON)."
            : `Erreur ${res.status} — le serveur n'a pas renvoyé de JSON (souvent une page HTML de proxy ou un timeout).`
        );
      }
      if (!res.ok) {
        const errBody = data as { error?: string };
        throw new Error(errBody.error ?? "Échec de la création");
      }
      const created = data as BankAccount & {
        telegram_setup_warning?: string;
        telegram_invite_warnings?: { telegram_id: number; name?: string; telegram_username?: string; reason: string }[];
      };
      setBankAccounts((prev) =>
        [...prev, created as BankAccount].sort(
          (a, b) => (a.company_name ?? "").localeCompare(b.company_name ?? "") || a.name.localeCompare(b.name)
        )
      );
      const setupWarning =
        typeof created.telegram_setup_warning === "string"
          ? created.telegram_setup_warning.trim()
          : "";
      const warnings = created.telegram_invite_warnings;
      const inviteParts: string[] = [];
      if (setupWarning) inviteParts.push(setupWarning);
      if (Array.isArray(warnings) && warnings.length > 0) {
        const names = warnings.map((w) => w.name || (w.telegram_username ? `@${w.telegram_username}` : `ID ${w.telegram_id}`));
        const reasonMsg = warnings.some((w) => w.reason === "UserNotMutualContactError")
          ? "Ils doivent être dans les contacts du compte Telegram admin."
          : warnings.some((w) => w.reason === "UserPrivacyRestrictedError")
            ? "Paramètres de confidentialité Telegram : la personne doit aller dans Paramètres → Confidentialité → Groupes et canaux → « Qui peut vous ajouter aux groupes » et choisir « Tout le monde » ou « Mes contacts »."
            : warnings.some((w) => String(w.reason).includes("FloodWaitError"))
              ? "Telegram limite temporairement les invitations (anti-spam). Le délai peut être très long ; attendez ou ajoutez les membres à la main dans le groupe. Le service espère désormais les invitations par petits lots avec des pauses plus longues."
              : warnings.some((w) => String(w.reason).includes("PeerFloodError"))
                ? "Trop d'invitations trop rapides pour ce groupe (limite Telegram). Réessayez plus tard, augmentez les pauses côté service (TELEGRAM_DELAY_CLASSIC_CHAT_INVITE_SEC, TELEGRAM_PEER_FLOOD_RETRY_SEC) ou ajoutez les membres à la main."
                : warnings.length > 0
                ? `Raison technique : ${warnings.map((w) => w.reason).filter(Boolean).join(", ")}`
                : null;
        inviteParts.push(
          `${warnings.length} utilisateur(s) n'ont pas pu être ajoutés : ${names.join(", ")}. ${reasonMsg ?? ""}`
        );
      }
      if (inviteParts.length > 0) {
        setCreateInviteWarning(inviteParts.join("\n\n"));
      }
      if (createLinkTelegramEnabled && created.telegram_chat_id != null) {
        const cr = created as BankAccount;
        const co = companies.find((c) => c.id === String(cr.company_id ?? createCompanyId));
        let emailStr = (cr.company_email ?? "").trim();
        if (!emailStr && co?.emails && co.emails.length > 0) {
          emailStr = co.emails[0]!.trim();
        }
        const welcomeDraft = buildTelegramWelcomeDraft({
          companyName: (co?.name ?? cr.company_name ?? "").trim(),
          address: co?.address,
          codePostal: co?.code_postal,
          ville: co?.ville,
          email: emailStr || null,
          siret: co?.siret,
          directeur: co?.directeur,
          ibans: Array.isArray(cr.ibans) ? cr.ibans : [],
          bankName: (cr.bank_name ?? "").trim() || null,
        });
        setCreatePostTelegram({
          accountId: String(created.id),
          accountName: typeof created.name === "string" ? created.name : createName.trim(),
          telegramChatId: String(created.telegram_chat_id),
          hasBankLogo: !!(created as { has_logo?: boolean }).has_logo,
          hasRib: !!(created as BankAccount).has_rib,
          companyId: String((created as BankAccount).company_id ?? createCompanyId ?? ""),
          welcomeDraft,
        });
      } else if (inviteParts.length === 0) {
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
      const body: {
        name: string;
        company_id: string;
        bank_id?: string | null;
        account_type_id?: string | null;
        account_status_id?: string;
        telegram_chat_id?: number | null;
        ibans?: IbanItem[];
        login?: string | null;
        password?: string | null;
        pin_code?: string | null;
        plafond_limit?: string | null;
        cards?: CardItem[];
        company_email_id?: string | null;
        company_phone_id?: string | null;
      } = {
        name,
        company_id: editCompanyId,
      };
      body.bank_id = editBankId || null;
      body.account_type_id = editAccountTypeId || null;
      if (editAccountStatusId) body.account_status_id = editAccountStatusId;
      const tid = editTelegramChatId.trim();
      if (!tid) body.telegram_chat_id = null;
      else {
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
      if (editLogin.trim()) body.login = editLogin.trim();
      else body.login = null;
      if (editPassword.trim()) body.password = editPassword.trim();
      else body.password = null;
      if (editPinCode.trim()) body.pin_code = editPinCode.trim();
      else body.pin_code = null;
      if (editPlafondLimit.trim()) body.plafond_limit = editPlafondLimit.trim();
      else body.plafond_limit = null;
      const cardsToSend = editCards
        .map((v) => ({
          numero: v.numero.trim().replace(/\s/g, ""),
          date_expiration: (v.date_expiration ?? "").trim() || undefined,
          cvv: (v.cvv ?? "").trim() || undefined,
        }))
        .filter((v) => v.numero.length > 0);
      body.cards = cardsToSend;
      const effectiveEmailId = editCompanyEmailId.trim() || (editCompanyEmails.find((e) => e.is_default)?.id ?? editCompanyEmails[0]?.id ?? "");
      const effectivePhoneId = editCompanyPhoneId.trim() || (editCompanyPhones.find((p) => p.is_default)?.id ?? editCompanyPhones[0]?.id ?? "");
      body.company_email_id = effectiveEmailId || null;
      body.company_phone_id = effectivePhoneId || null;
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
                account_type_emoji: updated.account_type_emoji ?? undefined,
                account_status_id: updated.account_status_id ?? undefined,
                account_status_name: updated.account_status_name ?? undefined,
                account_status_emoji: updated.account_status_emoji ?? undefined,
                telegram_chat_id: updated.telegram_chat_id,
                ibans: updated.ibans ?? ba.ibans,
                login: updated.login ?? ba.login,
                password: updated.password ?? ba.password,
                pin_code: updated.pin_code ?? ba.pin_code,
                plafond_limit: updated.plafond_limit ?? ba.plafond_limit,
                cards: updated.cards ?? ba.cards,
                company_email_id: updated.company_email_id ?? undefined,
                company_phone_id: updated.company_phone_id ?? undefined,
                company_email: updated.company_email ?? undefined,
                company_phone: updated.company_phone ?? undefined,
                company_source_id: updated.company_source_id ?? undefined,
                company_source_name: updated.company_source_name ?? undefined,
                company_fournisseur: updated.company_fournisseur ?? undefined,
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-row">
        <main className="relative z-0 min-h-0 min-w-0 flex-1 overflow-auto p-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary-muted)] text-[var(--primary)]">
                <BuildingIcon className="h-6 w-6" />
              </div>
              <div>
                <h1 className="page-title text-2xl font-semibold">Comptes bancaires</h1>
                <p className="text-sm text-[var(--muted-foreground)]">Gérez vos comptes et transactions</p>
              </div>
            </div>
            {bankAccounts.length > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="search"
                    placeholder="Rechercher par nom de compte ou société…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full min-w-0 max-w-xl rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] sm:max-w-md"
                    aria-label="Rechercher par nom de compte ou société"
                  />
                  <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-[var(--muted-foreground)]">
                    <span className="shrink-0 font-medium text-[var(--foreground)]">Trier</span>
                    <select
                      value={accountsSortMode}
                      onChange={(e) =>
                        setAccountsSortMode(
                          e.target.value as typeof accountsSortMode
                        )
                      }
                      className="min-w-[12rem] rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      aria-label="Trier la liste des comptes"
                    >
                      <option value="alpha">Alphabétique</option>
                      <option value="balance_asc">Solde croissant</option>
                      <option value="balance_desc">Solde décroissant</option>
                      <option value="status">Par statuts</option>
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:hidden">
                  {hasActiveAccountFilters && (
                    <button
                      type="button"
                      onClick={resetAccountFilters}
                      className="inline-flex shrink-0 items-center rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
                    >
                      Réinitialiser les filtres
                    </button>
                  )}
                  {banksWithCounts.length > 1 && (
                    <select
                      value={selectedBankId ?? "__all__"}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedBankId(v === "__all__" ? null : v);
                      }}
                      className="min-w-[10rem] rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      aria-label="Filtrer par banque"
                    >
                      {banksWithCounts.map((item) => (
                        <option key={item.id} value={item.id}>
                          Banque · {item.name} ({item.count})
                        </option>
                      ))}
                    </select>
                  )}
                  {statusesWithCounts.length > 1 && (
                    <select
                      value={selectedStatusId ?? "__all__"}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedStatusId(v === "__all__" ? null : v);
                      }}
                      className="min-w-[10rem] rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      aria-label="Filtrer par statut"
                    >
                      {statusesWithCounts.map((item) => (
                        <option key={item.id} value={item.id}>
                          Statut · {item.name} ({item.count})
                        </option>
                      ))}
                    </select>
                  )}
                  {accountTypesWithFilterCounts.length > 1 && (
                    <select
                      value={selectedAccountTypeFilterId ?? "__all__"}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedAccountTypeFilterId(v === "__all__" ? null : v);
                      }}
                      className="min-w-[10rem] max-w-[16rem] rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      aria-label="Filtrer par client (type de compte)"
                    >
                      {accountTypesWithFilterCounts.map((item) => (
                        <option
                          key={item.id === "" ? "__aucun_client__" : item.id}
                          value={item.id}
                        >
                          Client · {item.name} ({item.count})
                        </option>
                      ))}
                    </select>
                  )}
                  {fournisseursWithCounts.length > 1 && (
                    <select
                      value={
                        selectedFournisseurKey === null
                          ? "__all__"
                          : selectedFournisseurKey === ""
                            ? "__empty__"
                            : selectedFournisseurKey
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__all__") setSelectedFournisseurKey(null);
                        else if (v === "__empty__") setSelectedFournisseurKey("");
                        else setSelectedFournisseurKey(v);
                      }}
                      className="min-w-[10rem] max-w-[16rem] rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      aria-label="Filtrer par source ou fournisseur (société du compte)"
                    >
                      {fournisseursWithCounts.map((item) => (
                        <option
                          key={item.key === "" ? "__empty_val__" : item.key}
                          value={item.key === "__all__" ? "__all__" : item.key === "" ? "__empty__" : item.key}
                        >
                          Fournisseur · {item.label} ({item.count})
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    value={balanceBucket}
                    onChange={(e) =>
                      setBalanceBucket(e.target.value as typeof balanceBucket)
                    }
                    className="min-w-[10rem] rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    aria-label="Filtrer par solde"
                  >
                    {balanceBucketsWithCounts.map((item) => (
                      <option key={item.id} value={item.id}>
                        Solde · {item.label} ({item.count})
                      </option>
                    ))}
                  </select>
                  {bankAccounts.length > 0 && (
                    <div className="min-w-0 basis-full">
                      <BalanceAmountRangeControls
                        extent={balanceExtent}
                        rangeMin={balanceRangeMin}
                        rangeMax={balanceRangeMax}
                        step={balanceSliderStep}
                        onMinChange={onBalanceRangeMinChange}
                        onMaxChange={onBalanceRangeMaxChange}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 lg:self-start">
            {companies.length > 0 && (
              <button
                type="button"
                onClick={() => openCreateModal()}
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
            {search.trim()
              ? `Aucun compte ne correspond à « ${search} »${
                  hasActiveAccountFilters ? " avec les filtres choisis." : "."
                }`
              : hasActiveAccountFilters
                ? "Aucun compte ne correspond aux filtres."
                : "Aucun compte ne correspond."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {sortedBankAccounts.map((ba) => (
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
        {bankAccounts.length > 0 && (
          <aside className="relative sticky top-0 z-40 hidden h-screen max-h-screen w-52 shrink-0 flex-col self-start overflow-visible border-l border-[var(--border)] bg-[var(--muted)]/30 lg:flex">
            <div className="scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              <h2 className="mb-1 text-sm font-semibold text-[var(--foreground)]">Filtres</h2>
              <p className="mb-3 text-xs text-[var(--muted-foreground)]">
                Le détail s’ouvre à gauche, au-dessus de la liste.
              </p>
              {hasActiveAccountFilters && (
                <button
                  type="button"
                  onClick={resetAccountFilters}
                  className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
                >
                  Réinitialiser les filtres
                </button>
              )}
              <nav className="space-y-1">
                <button
                  type="button"
                  onClick={() =>
                    setAccountsFilterPanel((p) => (p === "banks" ? "hub" : "banks"))
                  }
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    accountsFilterPanel === "banks"
                      ? "bg-[var(--primary-muted)] font-medium text-[var(--primary)]"
                      : "text-[var(--foreground)] hover:bg-[var(--muted)]"
                  }`}
                >
                  <BuildingIcon className="h-4 w-4 shrink-0 opacity-70" />
                  <span className="min-w-0 flex-1 font-medium">Banques</span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 rotate-180 opacity-50" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAccountsFilterPanel((p) => (p === "status" ? "hub" : "status"))
                  }
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    accountsFilterPanel === "status"
                      ? "bg-[var(--primary-muted)] font-medium text-[var(--primary)]"
                      : "text-[var(--foreground)] hover:bg-[var(--muted)]"
                  }`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center text-xs opacity-70">
                    ◉
                  </span>
                  <span className="min-w-0 flex-1 font-medium">Statut</span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 rotate-180 opacity-50" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAccountsFilterPanel((p) => (p === "fournisseur" ? "hub" : "fournisseur"))
                  }
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    accountsFilterPanel === "fournisseur"
                      ? "bg-[var(--primary-muted)] font-medium text-[var(--primary)]"
                      : "text-[var(--foreground)] hover:bg-[var(--muted)]"
                  }`}
                >
                  <ListIcon className="h-4 w-4 shrink-0 opacity-70" />
                  <span className="min-w-0 flex-1 font-medium">Fournisseur</span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 rotate-180 opacity-50" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAccountsFilterPanel((p) => (p === "client" ? "hub" : "client"))
                  }
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    accountsFilterPanel === "client"
                      ? "bg-[var(--primary-muted)] font-medium text-[var(--primary)]"
                      : "text-[var(--foreground)] hover:bg-[var(--muted)]"
                  }`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center text-xs opacity-70">
                    ◎
                  </span>
                  <span className="min-w-0 flex-1 font-medium">Client</span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 rotate-180 opacity-50" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAccountsFilterPanel((p) => (p === "balance" ? "hub" : "balance"))
                  }
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    accountsFilterPanel === "balance"
                      ? "bg-[var(--primary-muted)] font-medium text-[var(--primary)]"
                      : "text-[var(--foreground)] hover:bg-[var(--muted)]"
                  }`}
                >
                  <ChartIcon className="h-4 w-4 shrink-0 opacity-70" />
                  <span className="min-w-0 flex-1 font-medium">Solde</span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 rotate-180 opacity-50" />
                </button>
              </nav>
            </div>
            {accountsFilterPanel !== "hub" && (
              <div
                className="scrollbar-hide absolute inset-y-0 right-full z-50 flex w-60 flex-col overflow-y-auto rounded-l-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--card-hover-shadow)]"
                role="dialog"
                aria-label="Filtre détaillé"
              >
                {accountsFilterPanel === "banks" && (
                  <>
                    <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
                      Par banque
                    </h2>
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
                            onClick={() =>
                              setSelectedBankId(item.id === "__all__" ? null : item.id)
                            }
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                              isActive
                                ? "bg-[var(--primary-muted)] font-medium text-[var(--primary)]"
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
                                {item.id === "__all__"
                                  ? "⊕"
                                  : item.id === ""
                                    ? "—"
                                    : item.name.slice(0, 1)}
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            <span className="shrink-0 text-xs tabular-nums opacity-70">
                              {item.count}
                            </span>
                          </button>
                        );
                      })}
                    </nav>
                  </>
                )}
                {accountsFilterPanel === "status" && (
                  <>
                    <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
                      Par statut
                    </h2>
                    <nav className="space-y-1">
                      {statusesWithCounts.map((item) => {
                        const isActive =
                          item.id === "__all__"
                            ? selectedStatusId === null
                            : selectedStatusId === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              setSelectedStatusId(item.id === "__all__" ? null : item.id)
                            }
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                              isActive
                                ? "bg-[var(--primary-muted)] font-medium text-[var(--primary)]"
                                : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                            }`}
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--muted)] text-sm">
                              {item.emoji?.trim() || "·"}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            <span className="shrink-0 text-xs tabular-nums opacity-70">
                              {item.count}
                            </span>
                          </button>
                        );
                      })}
                    </nav>
                  </>
                )}
                {accountsFilterPanel === "fournisseur" && (
                  <>
                    <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
                      Par fournisseur / source
                    </h2>
                    <p className="mb-2 text-xs text-[var(--muted-foreground)]">
                      Selon la source (fiche société), ou l’ancien champ texte fournisseur si présent.
                    </p>
                    <nav className="space-y-1">
                      {fournisseursWithCounts.map((item) => {
                        const isActive =
                          item.key === "__all__"
                            ? selectedFournisseurKey === null
                            : item.key === ""
                              ? selectedFournisseurKey === ""
                              : selectedFournisseurKey === item.key;
                        return (
                          <button
                            key={item.key === "" ? "__empty__" : item.key}
                            type="button"
                            onClick={() =>
                              setSelectedFournisseurKey(
                                item.key === "__all__" ? null : item.key
                              )
                            }
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                              isActive
                                ? "bg-[var(--primary-muted)] font-medium text-[var(--primary)]"
                                : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                            }`}
                          >
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            <span className="shrink-0 text-xs tabular-nums opacity-70">
                              {item.count}
                            </span>
                          </button>
                        );
                      })}
                    </nav>
                  </>
                )}
                {accountsFilterPanel === "client" && (
                  <>
                    <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
                      Par client
                    </h2>
                    <p className="mb-2 text-xs text-[var(--muted-foreground)]">
                      Même liste que le champ « Client » à la création ou l’édition du compte (Paramètres → Clients).
                    </p>
                    <nav className="space-y-1">
                      {accountTypesWithFilterCounts.map((item) => {
                        const isActive =
                          item.id === "__all__"
                            ? selectedAccountTypeFilterId === null
                            : item.id === ""
                              ? selectedAccountTypeFilterId === ""
                              : selectedAccountTypeFilterId === item.id;
                        return (
                          <button
                            key={item.id === "" ? "__aucun_client__" : item.id}
                            type="button"
                            onClick={() =>
                              setSelectedAccountTypeFilterId(
                                item.id === "__all__" ? null : item.id
                              )
                            }
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                              isActive
                                ? "bg-[var(--primary-muted)] font-medium text-[var(--primary)]"
                                : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                            }`}
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--muted)] text-sm">
                              {item.id === "__all__"
                                ? "⊕"
                                : item.id === ""
                                  ? "—"
                                  : item.emoji?.trim() || item.name.slice(0, 1)}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            <span className="shrink-0 text-xs tabular-nums opacity-70">
                              {item.count}
                            </span>
                          </button>
                        );
                      })}
                    </nav>
                  </>
                )}
                {accountsFilterPanel === "balance" && (
                  <>
                    <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
                      Par solde
                    </h2>
                    <nav className="space-y-1">
                      {balanceBucketsWithCounts.map((item) => {
                        const isActive = balanceBucket === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setBalanceBucket(item.id)}
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                              isActive
                                ? "bg-[var(--primary-muted)] font-medium text-[var(--primary)]"
                                : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                            }`}
                          >
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            <span className="shrink-0 text-xs tabular-nums opacity-70">
                              {item.count}
                            </span>
                          </button>
                        );
                      })}
                    </nav>
                    <BalanceAmountRangeControls
                      extent={balanceExtent}
                      rangeMin={balanceRangeMin}
                      rangeMax={balanceRangeMax}
                      step={balanceSliderStep}
                      onMinChange={onBalanceRangeMinChange}
                      onMaxChange={onBalanceRangeMaxChange}
                    />
                  </>
                )}
              </div>
            )}
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
          accountStatuses={accountStatuses}
          name={editName}
          companyId={editCompanyId}
          bankId={editBankId}
          accountTypeId={editAccountTypeId}
          accountStatusId={editAccountStatusId}
          telegramChatId={editTelegramChatId}
          ibans={editIbans}
          login={editLogin}
          password={editPassword}
          pinCode={editPinCode}
          plafondLimit={editPlafondLimit}
          cards={editCards}
          hasRib={editHasRib}
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
          onAccountStatusIdChange={(v) => {
            setEditAccountStatusId(v);
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
          onLoginChange={(v) => {
            setEditLogin(v);
            setError(null);
          }}
          onPasswordChange={(v) => {
            setEditPassword(v);
            setError(null);
          }}
          onPinCodeChange={(v) => {
            setEditPinCode(v);
            setError(null);
          }}
          onPlafondLimitChange={(v) => {
            setEditPlafondLimit(v);
            setError(null);
          }}
          onCardsChange={(v) => {
            setEditCards(v);
            setError(null);
          }}
          onRibUploaded={() => setEditHasRib(true)}
          onSave={handleSave}
          onClose={closeModal}
          saving={saving}
          error={error}
          companyEmails={editCompanyEmails}
          companyPhones={editCompanyPhones}
          companyEmailId={editCompanyEmailId}
          companyPhoneId={editCompanyPhoneId}
          onCompanyEmailIdChange={(v) => {
            setEditCompanyEmailId(v);
            setError(null);
          }}
          onCompanyPhoneIdChange={(v) => {
            setEditCompanyPhoneId(v);
            setError(null);
          }}
        />
      )}
      {createModalOpen && (
        <CreateBankAccountModal
          companies={companies}
          banks={banks}
          accountTypes={accountTypes}
          accountStatuses={accountStatuses}
          name={createName}
          companyId={createCompanyId}
          bankId={createBankId}
          accountTypeId={createAccountTypeId}
          accountStatusId={createAccountStatusId}
          ibans={createIbans}
          login={createLogin}
          password={createPassword}
          pinCode={createPinCode}
          plafondLimit={createPlafondLimit}
          cards={createCards}
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
          onAccountStatusIdChange={(v) => {
            setCreateAccountStatusId(v);
            setError(null);
          }}
          onIbansChange={(v) => {
            setCreateIbans(v);
            setError(null);
          }}
          onLoginChange={(v) => {
            setCreateLogin(v);
            setError(null);
          }}
          onPasswordChange={(v) => {
            setCreatePassword(v);
            setError(null);
          }}
          onPinCodeChange={(v) => {
            setCreatePinCode(v);
            setError(null);
          }}
          onPlafondLimitChange={(v) => {
            setCreatePlafondLimit(v);
            setError(null);
          }}
          onCardsChange={(v) => {
            setCreateCards(v);
            setError(null);
          }}
          linkTelegramEnabled={createLinkTelegramEnabled}
          onLinkTelegramEnabledChange={(v) => {
            setCreateLinkTelegramEnabled(v);
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
          postCreateTelegram={createPostTelegram}
        />
      )}
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-0 flex-1 flex-col p-6"><p className="text-[var(--muted-foreground)]">Chargement…</p></div>}>
      <AccountsPageContent />
    </Suspense>
  );
}
