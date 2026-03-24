"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { BankAccount, Transaction, TransactionType } from "@/lib/types";
import {
  bankAccountDisplayName,
  type TransactionFilterValues,
  PROCESSED_BY_EMPTY_KEY,
  transactionAccountLabel,
} from "@/lib/transaction-filters";

const TRANSACTION_TYPES: TransactionType[] = ["DEBIT", "CREDIT"];

function typeLabel(t: TransactionType): string {
  return t === "CREDIT" ? "Crédit" : "Débit";
}

export interface FilterMenuAnchor {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface TransactionColumnFilterMenuProps {
  columnId: string;
  anchor: FilterMenuAnchor;
  sortable: boolean;
  applied: TransactionFilterValues;
  transactionsForOptions: Transaction[];
  bankAccounts: BankAccount[];
  onClose: () => void;
  onApply: (next: TransactionFilterValues) => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
}

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent) => {
      const el = ref.current;
      if (!el || el.contains(e.target as Node)) return;
      onOutside();
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [enabled, onOutside, ref]);
}

export function TransactionColumnFilterMenu({
  columnId,
  anchor,
  sortable,
  applied,
  transactionsForOptions,
  bankAccounts,
  onClose,
  onApply,
  onSortAsc,
  onSortDesc,
}: TransactionColumnFilterMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<TransactionFilterValues>(() => ({ ...applied }));
  const [valueSearch, setValueSearch] = useState("");

  useClickOutside(rootRef, onClose, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bankOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const ba of bankAccounts) {
      map.set(ba.id, bankAccountDisplayName(ba));
    }
    for (const t of transactionsForOptions) {
      if (!map.has(t.bank_account_id)) {
        map.set(t.bank_account_id, transactionAccountLabel(t) || t.bank_account_id);
      }
    }
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [bankAccounts, transactionsForOptions]);

  const processedOptions = useMemo(() => {
    const names = new Set<string>();
    let hasEmpty = false;
    for (const t of transactionsForOptions) {
      const n = t.processed_by_user_name ?? "";
      if (n === "") hasEmpty = true;
      else names.add(n);
    }
    const list = [...names].sort((a, b) => a.localeCompare(b, "fr"));
    if (hasEmpty) list.unshift(PROCESSED_BY_EMPTY_KEY);
    return list;
  }, [transactionsForOptions]);

  const filteredBankOptions = useMemo(() => {
    const q = valueSearch.trim().toLowerCase();
    if (!q) return bankOptions;
    return bankOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [bankOptions, valueSearch]);

  const filteredProcessedOptions = useMemo(() => {
    const q = valueSearch.trim().toLowerCase();
    if (!q) return processedOptions;
    return processedOptions.filter((n) => {
      if (n === PROCESSED_BY_EMPTY_KEY) return "(vide)".includes(q) || "vide".includes(q);
      return n.toLowerCase().includes(q);
    });
  }, [processedOptions, valueSearch]);

  const applyDraft = useCallback(() => {
    onApply(draft);
    onClose();
  }, [draft, onApply, onClose]);

  const bottom = anchor.top + anchor.height;
  const menuWidth = 300;
  const maxLeft = typeof window !== "undefined" ? Math.max(8, window.innerWidth - menuWidth - 8) : 8;
  const left = Math.min(anchor.left, maxLeft);

  const sectionTitle = (t: string) => (
    <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
      {t}
    </div>
  );

  const menuBtn =
    "w-full rounded-md px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors";

  const sortBlock =
    sortable && columnId !== "rowNum" ? (
      <>
        {sectionTitle("Tri")}
        <button type="button" className={menuBtn} onClick={() => onSortAsc()}>
          Trier de A à Z
        </button>
        <button type="button" className={menuBtn} onClick={() => onSortDesc()}>
          Trier de Z à A
        </button>
        <div className="my-2 border-t border-[var(--border)]" />
      </>
    ) : null;

  let body: ReactNode = null;

  if (columnId === "bank_account_name") {
    const selected =
      draft.bankFilter.mode === "include" ? new Set(draft.bankFilter.ids) : new Set(bankOptions.map((o) => o.id));
    const allIds = bankOptions.map((o) => o.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
    const toggle = (id: string) => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setDraft({
        ...draft,
        bankFilter: { mode: "include", ids: [...next] },
      });
    };
    const selectAll = () =>
      setDraft({ ...draft, bankFilter: { mode: "include", ids: [...allIds] } });
    const clearAll = () => setDraft({ ...draft, bankFilter: { mode: "include", ids: [] } });
    body = (
      <>
        {sectionTitle("Filtrer par valeurs")}
        <div className="flex flex-wrap gap-2 px-3 pb-2 text-xs">
          <button type="button" className="text-[var(--primary)] hover:underline" onClick={selectAll}>
            Tout sélectionner ({allIds.length})
          </button>
          <button type="button" className="text-[var(--primary)] hover:underline" onClick={clearAll}>
            Effacer
          </button>
        </div>
        <p className="px-3 pb-1 text-xs text-[var(--muted-foreground)]">Affichage de {filteredBankOptions.length}</p>
        <div className="px-3 pb-2">
          <div className="relative">
            <input
              type="search"
              value={valueSearch}
              onChange={(e) => setValueSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-3 pr-9 text-sm"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">
              ⌕
            </span>
          </div>
        </div>
        <ul className="max-h-48 overflow-y-auto px-1">
          {filteredBankOptions.map((o) => (
            <li key={o.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={selected.has(o.id)}
                  onChange={() => toggle(o.id)}
                  className="rounded border-[var(--border)]"
                />
                <span className="truncate">{o.label}</span>
              </label>
            </li>
          ))}
        </ul>
        {!allSelected && (
          <p className="px-3 pb-2 text-[11px] text-[var(--muted-foreground)]">
            Plusieurs comptes : filtrage sur les lignes chargées. Un seul compte : requête serveur optimisée.
          </p>
        )}
      </>
    );
  } else if (columnId === "transaction_date") {
    body = (
      <>
        {sectionTitle("Période")}
        <div className="space-y-2 px-3 pb-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            Du
            <input
              type="date"
              value={draft.dateFrom}
              onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            Au
            <input
              type="date"
              value={draft.dateTo}
              onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </>
    );
  } else if (columnId === "type") {
    const selected =
      draft.typeFilter.mode === "include"
        ? new Set(draft.typeFilter.types)
        : new Set<TransactionType>(TRANSACTION_TYPES);
    const toggle = (t: TransactionType) => {
      const next = new Set(selected);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      setDraft({
        ...draft,
        typeFilter: { mode: "include", types: [...next] },
      });
    };
    const selectAll = () =>
      setDraft({
        ...draft,
        typeFilter: { mode: "include", types: [...TRANSACTION_TYPES] },
      });
    const clearAll = () => setDraft({ ...draft, typeFilter: { mode: "include", types: [] } });
    body = (
      <>
        {sectionTitle("Filtrer par valeurs")}
        <div className="flex flex-wrap gap-2 px-3 pb-2 text-xs">
          <button type="button" className="text-[var(--primary)] hover:underline" onClick={selectAll}>
            Tout sélectionner (2)
          </button>
          <button type="button" className="text-[var(--primary)] hover:underline" onClick={clearAll}>
            Effacer
          </button>
        </div>
        <div className="px-3 pb-2">
          <div className="relative">
            <input
              type="search"
              value={valueSearch}
              onChange={(e) => setValueSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-3 pr-9 text-sm"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">
              ⌕
            </span>
          </div>
        </div>
        <ul className="max-h-48 overflow-y-auto px-1">
          {TRANSACTION_TYPES.filter((t) => typeLabel(t).toLowerCase().includes(valueSearch.trim().toLowerCase())).map(
            (t) => (
              <li key={t}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={selected.has(t)}
                    onChange={() => toggle(t)}
                    className="rounded border-[var(--border)]"
                  />
                  {typeLabel(t)}
                </label>
              </li>
            )
          )}
        </ul>
      </>
    );
  } else if (columnId === "description") {
    body = (
      <>
        {sectionTitle("Filtrer par condition")}
        <div className="px-3 pb-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            Le texte contient
            <input
              type="search"
              value={draft.descriptionContains}
              onChange={(e) => setDraft({ ...draft, descriptionContains: e.target.value })}
              placeholder="Rechercher dans la description…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            />
          </label>
        </div>
      </>
    );
  } else if (columnId === "amount") {
    body = (
      <>
        {sectionTitle("Montant (signé débit / crédit)")}
        <div className="grid grid-cols-2 gap-2 px-3 pb-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            Min
            <input
              type="text"
              inputMode="decimal"
              value={draft.amountMin}
              onChange={(e) => setDraft({ ...draft, amountMin: e.target.value })}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            Max
            <input
              type="text"
              inputMode="decimal"
              value={draft.amountMax}
              onChange={(e) => setDraft({ ...draft, amountMax: e.target.value })}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </>
    );
  } else if (columnId === "processed_by_user_name") {
    const allNames = processedOptions;
    const selected =
      draft.processedByFilter === null
        ? new Set(allNames)
        : new Set(draft.processedByFilter.names);
    const toggle = (name: string) => {
      const next = new Set(selected);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setDraft({
        ...draft,
        processedByFilter: { mode: "include", names: [...next] },
      });
    };
    const selectAll = () =>
      setDraft({ ...draft, processedByFilter: { mode: "include", names: [...allNames] } });
    const clearAll = () => setDraft({ ...draft, processedByFilter: { mode: "include", names: [] } });
    const displayName = (n: string) => (n === PROCESSED_BY_EMPTY_KEY ? "(Vide)" : n);
    body = (
      <>
        {sectionTitle("Filtrer par valeurs")}
        <div className="flex flex-wrap gap-2 px-3 pb-2 text-xs">
          <button type="button" className="text-[var(--primary)] hover:underline" onClick={selectAll}>
            Tout sélectionner ({allNames.length})
          </button>
          <button type="button" className="text-[var(--primary)] hover:underline" onClick={clearAll}>
            Effacer
          </button>
        </div>
        <p className="px-3 pb-1 text-xs text-[var(--muted-foreground)]">Affichage de {filteredProcessedOptions.length}</p>
        <div className="px-3 pb-2">
          <div className="relative">
            <input
              type="search"
              value={valueSearch}
              onChange={(e) => setValueSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-3 pr-9 text-sm"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">
              ⌕
            </span>
          </div>
        </div>
        <ul className="max-h-48 overflow-y-auto px-1">
          {filteredProcessedOptions.map((n) => (
            <li key={n}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={selected.has(n)}
                  onChange={() => toggle(n)}
                  className="rounded border-[var(--border)]"
                />
                <span className="truncate">{displayName(n)}</span>
              </label>
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (body === null) {
    return null;
  }

  return createPortal(
    <div
      ref={rootRef}
      className="fixed z-[100] flex max-h-[min(420px,calc(100vh-24px))] w-[300px] flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] py-2 shadow-lg"
      style={{ top: bottom + 4, left }}
      role="dialog"
      aria-label="Filtre de colonne"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sortBlock}
        {body}
      </div>
      <div className="mt-2 flex shrink-0 gap-2 border-t border-[var(--border)] px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-medium text-[var(--primary)]"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={applyDraft}
          className="flex-1 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)]"
        >
          OK
        </button>
      </div>
    </div>,
    document.body
  );
}
