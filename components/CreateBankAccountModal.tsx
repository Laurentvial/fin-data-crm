"use client";

import { useState } from "react";
import { AccountNameField } from "@/components/AccountNameField";
import { BankSelect } from "@/components/BankSelect";
import { Select } from "@/components/Select";
import type { AccountStatus, AccountType, Bank, CardItem, Company, IbanItem } from "@/lib/types";

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

export interface CreateBankAccountModalProps {
  companies: Company[];
  banks: Bank[];
  accountTypes: AccountType[];
  accountStatuses: AccountStatus[];
  name: string;
  companyId: string;
  bankId: string;
  accountTypeId: string;
  accountStatusId: string;
  ibans: IbanItem[];
  login?: string;
  password?: string;
  pinCode?: string;
  plafondLimit?: string;
  cards?: CardItem[];
  onNameChange: (v: string) => void;
  onCompanyIdChange: (v: string) => void;
  onBankIdChange: (v: string) => void;
  onAccountTypeIdChange: (v: string) => void;
  onAccountStatusIdChange: (v: string) => void;
  onIbansChange: (v: IbanItem[]) => void;
  onLoginChange?: (v: string) => void;
  onPasswordChange?: (v: string) => void;
  onPinCodeChange?: (v: string) => void;
  onPlafondLimitChange?: (v: string) => void;
  onCardsChange?: (v: CardItem[]) => void;
  onSubmit: () => void;
  onClose: () => void;
  saving: boolean;
  error?: string | null;
  inviteWarning?: string | null;
  /** When set, the company selector is hidden and this company is used */
  fixedCompanyId?: string;
  /** Optional: link an existing Telegram group by ID (e.g. -5186500052) instead of creating a new one */
  linkExistingGroupId?: string;
  onLinkExistingGroupIdChange?: (v: string) => void;
}

export function CreateBankAccountModal({
  companies,
  banks,
  accountTypes,
  name,
  companyId,
  bankId,
  accountTypeId,
  accountStatus = "Ouvert",
  ibans,
  login = "",
  password = "",
  pinCode = "",
  plafondLimit = "",
  cards = [],
  onNameChange,
  onCompanyIdChange,
  onBankIdChange,
  onAccountTypeIdChange,
  onAccountStatusIdChange,
  onIbansChange,
  onLoginChange,
  onPasswordChange,
  onPinCodeChange,
  onPlafondLimitChange,
  onCardsChange,
  onSubmit,
  onClose,
  saving,
  error,
  inviteWarning,
  fixedCompanyId,
  linkExistingGroupId = "",
  onLinkExistingGroupIdChange,
}: CreateBankAccountModalProps) {
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
  const addCard = () => onCardsChange?.([...cards, { numero: "", date_expiration: undefined, cvv: undefined }]);
  const removeCard = (i: number) => onCardsChange?.(cards.filter((_, idx) => idx !== i));
  const setCard = (i: number, field: "numero" | "date_expiration" | "cvv", value: string) => {
    const next = [...cards];
    next[i] = { ...next[i], [field]: value || undefined };
    onCardsChange?.(next);
  };
  const effectiveCompanyId = fixedCompanyId ?? companyId;
  const showCompanySelector = !fixedCompanyId;
  const [ibanExpanded, setIbanExpanded] = useState(true);
  const [cardsExpanded, setCardsExpanded] = useState(true);
  const [ibanLookupLoading, setIbanLookupLoading] = useState<number | null>(null);

  const lookupIbanBic = async (index: number) => {
    const item = ibans[index];
    const raw = (item?.iban ?? "").trim().replace(/\s/g, "");
    if (raw.length < 15) return;
    setIbanLookupLoading(index);
    try {
      const res = await fetch(`/api/iban/validate?iban=${encodeURIComponent(raw)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { valid?: boolean; swift_code?: string | null };
      if (!res.ok) return;
      const swiftCode = typeof data?.swift_code === "string" ? data.swift_code.trim() : "";
      if (data?.valid && swiftCode) {
        setBic(index, swiftCode);
      }
    } finally {
      setIbanLookupLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 p-6 pb-0">
        <h3 className="subsection-header mb-4 text-lg font-medium">Créer un compte bancaire</h3>
        <p className="mb-4 text-sm text-[var(--muted-foreground)]">
          {linkExistingGroupId !== ""
            ? "Liez un groupe Telegram existant en entrant son ID (ex. -5186500052)."
            : "Un groupe Telegram sera créé automatiquement et lié à ce compte."}
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
        </div>
        <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-3 gap-x-4 gap-y-4">
          {onLinkExistingGroupIdChange && (
            <div className="col-span-3">
              <label className="mb-1 flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                <input
                  type="checkbox"
                  checked={linkExistingGroupId !== ""}
                  onChange={(e) => onLinkExistingGroupIdChange(e.target.checked ? (linkExistingGroupId || "-") : "")}
                  className="rounded border-[var(--border)]"
                />
                Lier un groupe Telegram existant
              </label>
              {linkExistingGroupId !== "" && (
                <input
                  type="text"
                  value={linkExistingGroupId}
                  onChange={(e) => onLinkExistingGroupIdChange(e.target.value)}
                  placeholder="ID du groupe (ex. -5186500052)"
                  className="mt-2 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
                />
              )}
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom du compte</label>
            <AccountNameField
              value={name}
              onChange={onNameChange}
              placeholder="Ex. Compte courant"
              autoFocus
            />
          </div>
          {showCompanySelector && (
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Société</label>
              <Select
                value={companyId}
                onChange={(e) => onCompanyIdChange(e.target.value)}
              >
                <option value="">Sélectionner une société</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
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
            </div>
          )}
          {accountStatuses.length > 0 && (
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
            </div>
          )}
          <div className="col-span-3 grid grid-cols-2 gap-4">
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
                <p className="text-xs text-[var(--muted-foreground)]">Aucun IBAN. Cliquez sur &quot;+ Ajouter un IBAN&quot; si besoin.</p>
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
                        {ibanLookupLoading === i && (
                          <span className="text-xs text-[var(--muted-foreground)]">Vérification…</span>
                        )}
                    </div>
                  ))}
                </div>
              )}
              </div>
              )}
            </div>
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
                <p className="text-xs text-[var(--muted-foreground)]">Aucune carte. Cliquez sur &quot;+ Ajouter une carte&quot; si besoin.</p>
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

          <div className="col-span-3">
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Identifiants</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={login}
                onChange={(e) => onLoginChange?.(e.target.value)}
                placeholder="Login"
                className="block flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => onPasswordChange?.(e.target.value)}
                placeholder="Mot de passe"
                className="block flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={pinCode}
                onChange={(e) => onPinCodeChange?.(e.target.value)}
                placeholder="Code PIN"
                className="block flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="col-span-3">
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Plafond / limite</label>
            <input
              type="text"
              value={plafondLimit}
              onChange={(e) => onPlafondLimitChange?.(e.target.value)}
              placeholder="Ex. 5000 €"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
        </div>
        </div>
        <div className="shrink-0 border-t border-[var(--border)] p-6 pt-4">
        <div className="flex justify-end gap-2">
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
                disabled={saving || !name.trim() || !effectiveCompanyId}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Création…" : "Créer"}
              </button>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
