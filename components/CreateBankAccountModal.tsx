"use client";

import { BankSelect } from "@/components/BankSelect";
import type { Bank, Company, IbanItem } from "@/lib/types";

export interface CreateBankAccountModalProps {
  companies: Company[];
  banks: Bank[];
  name: string;
  companyId: string;
  bankId: string;
  ibans: IbanItem[];
  onNameChange: (v: string) => void;
  onCompanyIdChange: (v: string) => void;
  onBankIdChange: (v: string) => void;
  onIbansChange: (v: IbanItem[]) => void;
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
  const effectiveCompanyId = fixedCompanyId ?? companyId;
  const showCompanySelector = !fixedCompanyId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
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
        <div className="space-y-4">
          {onLinkExistingGroupIdChange && (
            <div>
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
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Ex. Compte courant"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              autoFocus
            />
          </div>
          {showCompanySelector && (
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
  );
}
