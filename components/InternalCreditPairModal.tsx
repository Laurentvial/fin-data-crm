"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Fournisseur, Transaction } from "@/lib/types";

export interface InternalTransferCandidate {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  amount: string;
  description: string;
  type: string;
  fournisseur_id?: string | null;
  fournisseur_name?: string | null;
  bank_account_name?: string | null;
  company_name?: string | null;
  bank_name?: string | null;
}

const CREATE_FOURNISSEUR_SENTINEL = "__create_fournisseur__";

interface InternalCreditPairModalProps {
  credit: Transaction;
  fournisseurs: Fournisseur[];
  /** Option « + Nouveau fournisseur… » dans le menu Fournisseur. */
  onQuickCreateFournisseur?: () => Promise<Fournisseur | null>;
  onClose: () => void;
  onPaired: () => void;
}

function formatMoney(amount: string | undefined): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return amount ?? "—";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function InternalCreditPairModal({
  credit,
  fournisseurs,
  onQuickCreateFournisseur,
  onClose,
  onPaired,
}: InternalCreditPairModalProps) {
  const [candidates, setCandidates] = useState<InternalTransferCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDebitId, setSelectedDebitId] = useState("");
  const [fournisseurId, setFournisseurId] = useState(credit.fournisseur_id ?? "");
  const [saving, setSaving] = useState(false);
  const [fournisseurCreateBusy, setFournisseurCreateBusy] = useState(false);
  const orderedFournisseurs = useMemo(
    () => [...fournisseurs].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [fournisseurs]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/transactions/internal-transfer-candidates?credit_id=${encodeURIComponent(credit.id)}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Erreur de chargement");
        }
        if (!cancelled) {
          setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erreur");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [credit.id]);

  const submit = useCallback(async () => {
    if (!selectedDebitId) {
      setError("Sélectionnez un débit sur un autre compte.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${credit.id}/internal-credit-pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          debit_id: selectedDebitId,
          fournisseur_id: fournisseurId === "" ? null : fournisseurId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : `HTTP ${res.status}`);
      }
      onPaired();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }, [credit.id, selectedDebitId, fournisseurId, onClose, onPaired]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="internal-credit-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="internal-credit-title" className="mb-2 text-lg font-medium text-[var(--foreground)]">
          Crédit interne — lier le débit miroir
        </h2>
        <p className="mb-4 text-sm text-[var(--muted-foreground)]">
          Ligne crédit : {formatMoney(credit.amount)} € · {(credit.transaction_date ?? "").slice(0, 10)} ·{" "}
          {credit.description?.trim() || "—"}
        </p>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">Chargement des débits similaires…</p>
        ) : candidates.length === 0 ? (
          <p className="py-6 text-sm text-[var(--muted-foreground)]">
            Aucun débit trouvé (autre compte, tous comptes / sociétés, même montant, date à ±7 jours, pas déjà lié).
          </p>
        ) : (
          <div className="mb-4 max-h-52 space-y-2 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
            {candidates.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer gap-2 rounded-md px-2 py-2 text-sm hover:bg-[var(--muted)]/50"
              >
                <input
                  type="radio"
                  name="debit-pair"
                  className="mt-1"
                  checked={selectedDebitId === c.id}
                  onChange={() => setSelectedDebitId(c.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium tabular-nums">{formatMoney(c.amount)} €</span>
                  {" · "}
                  <span className="tabular-nums">{(c.transaction_date ?? "").slice(0, 10)}</span>
                  <br />
                  <span className="text-[var(--muted-foreground)]">
                    {c.bank_name ?? ""} · {c.bank_account_name ?? ""} · {c.company_name ?? ""}
                  </span>
                  <br />
                  <span className="truncate text-xs text-[var(--muted-foreground)]">
                    {c.description?.trim() || "—"}
                    {c.fournisseur_name ? ` · Fourn. : ${c.fournisseur_name}` : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="mb-6">
          <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Fournisseur</label>
          <select
            value={fournisseurId}
            disabled={fournisseurCreateBusy}
            onChange={async (e) => {
              const v = e.target.value;
              if (v === CREATE_FOURNISSEUR_SENTINEL) {
                if (!onQuickCreateFournisseur || fournisseurCreateBusy) return;
                setFournisseurCreateBusy(true);
                try {
                  const created = await onQuickCreateFournisseur();
                  if (created?.id) setFournisseurId(created.id);
                } finally {
                  setFournisseurCreateBusy(false);
                }
                return;
              }
              setFournisseurId(v);
            }}
            className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="">—</option>
            {orderedFournisseurs.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
            {onQuickCreateFournisseur ? (
              <option value={CREATE_FOURNISSEUR_SENTINEL}>+ Nouveau fournisseur…</option>
            ) : null}
          </select>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Le même fournisseur sera enregistré sur le débit lié et sur ce crédit interne.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--muted)]"
            onClick={onClose}
            disabled={saving}
          >
            Annuler
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
            onClick={() => void submit()}
            disabled={saving || loading || candidates.length === 0}
          >
            {saving ? "Enregistrement…" : "Valider"}
          </button>
        </div>
      </div>
    </div>
  );
}
