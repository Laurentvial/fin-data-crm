"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Transaction, TransactionType } from "@/lib/types";
import {
  DEFAULT_TRANSACTION_TABLE_SORT,
  isDefaultTransactionTableSort,
} from "@/lib/transaction-sort";
import {
  ACCOUNT_STATUS_EMPTY_KEY,
  BANK_EMPTY_KEY,
  CLIENT_EMPTY_KEY,
  COMPANY_EMPTY_KEY,
  ETAT_EMPTY_KEY,
  FOURNISSEUR_EMPTY_KEY,
  getClientFilterKeys,
  getAccountStatusFilterKeys,
  getBankNameFilterKeys,
  getEtatFilterKeys,
  getFournisseurFilterKeys,
  type TransactionAmountFilterMode,
  type TransactionFilterValues,
  PROCESSED_BY_EMPTY_KEY,
} from "@/lib/transaction-filters";
import { transactionTypeLabel } from "@/lib/transaction-type";
import { CREDIT_STATUS_VALUES, creditStatusLabel } from "@/lib/credit-status";
import { DEBIT_STATUS_VALUES, debitStatusLabel } from "@/lib/debit-status";

const TRANSACTION_TYPES: TransactionType[] = ["DEBIT", "CREDIT", "INTERNAL_CREDIT"];

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
  /** Tri en cours : met en évidence A→Z ou Z→A pour cette colonne. */
  sortState?: { column: string; direction: "asc" | "desc" } | null;
  applied: TransactionFilterValues;
  transactionsForOptions: Transaction[];
  onClose: () => void;
  onApply: (next: TransactionFilterValues) => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  /** Rétablit le tri par défaut du tableau (ex. date, plus récent en premier). */
  onSortDefault?: () => void;
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
  sortState = null,
  applied,
  transactionsForOptions,
  onClose,
  onApply,
  onSortAsc,
  onSortDesc,
  onSortDefault,
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

  const bankNameOptions = useMemo(
    () => getBankNameFilterKeys(transactionsForOptions),
    [transactionsForOptions]
  );

  const accountStatusOptions = useMemo(
    () => getAccountStatusFilterKeys(transactionsForOptions),
    [transactionsForOptions]
  );

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

  const companyOptions = useMemo(() => {
    const names = new Set<string>();
    let hasEmpty = false;
    for (const t of transactionsForOptions) {
      const n = t.company_name ?? "";
      if (n === "") hasEmpty = true;
      else names.add(n);
    }
    const list = [...names].sort((a, b) => a.localeCompare(b, "fr"));
    if (hasEmpty) list.unshift(COMPANY_EMPTY_KEY);
    return list;
  }, [transactionsForOptions]);

  const fournisseurOptions = useMemo(
    () => getFournisseurFilterKeys(transactionsForOptions),
    [transactionsForOptions]
  );

  const clientOptions = useMemo(
    () => getClientFilterKeys(transactionsForOptions),
    [transactionsForOptions]
  );

  const etatOptions = useMemo(
    () => getEtatFilterKeys(transactionsForOptions),
    [transactionsForOptions]
  );

  const filteredBankNameOptions = useMemo(() => {
    const q = valueSearch.trim().toLowerCase();
    if (!q) return bankNameOptions;
    return bankNameOptions.filter((n) => {
      if (n === BANK_EMPTY_KEY) return "(vide)".includes(q) || "vide".includes(q);
      return n.toLowerCase().includes(q);
    });
  }, [bankNameOptions, valueSearch]);

  const filteredAccountStatusOptions = useMemo(() => {
    const q = valueSearch.trim().toLowerCase();
    if (!q) return accountStatusOptions;
    return accountStatusOptions.filter((n) => {
      if (n === ACCOUNT_STATUS_EMPTY_KEY) return "(vide)".includes(q) || "vide".includes(q);
      return n.toLowerCase().includes(q);
    });
  }, [accountStatusOptions, valueSearch]);

  const filteredProcessedOptions = useMemo(() => {
    const q = valueSearch.trim().toLowerCase();
    if (!q) return processedOptions;
    return processedOptions.filter((n) => {
      if (n === PROCESSED_BY_EMPTY_KEY) return "(vide)".includes(q) || "vide".includes(q);
      return n.toLowerCase().includes(q);
    });
  }, [processedOptions, valueSearch]);

  const filteredCompanyOptions = useMemo(() => {
    const q = valueSearch.trim().toLowerCase();
    if (!q) return companyOptions;
    return companyOptions.filter((n) => {
      if (n === COMPANY_EMPTY_KEY) return "(vide)".includes(q) || "vide".includes(q);
      return n.toLowerCase().includes(q);
    });
  }, [companyOptions, valueSearch]);

  const filteredFournisseurOptions = useMemo(() => {
    const q = valueSearch.trim().toLowerCase();
    if (!q) return fournisseurOptions;
    return fournisseurOptions.filter((n) => {
      if (n === FOURNISSEUR_EMPTY_KEY) return "(vide)".includes(q) || "vide".includes(q);
      return n.toLowerCase().includes(q);
    });
  }, [fournisseurOptions, valueSearch]);

  const filteredClientOptions = useMemo(() => {
    const q = valueSearch.trim().toLowerCase();
    if (!q) return clientOptions;
    return clientOptions.filter((n) => {
      if (n === CLIENT_EMPTY_KEY) return "(vide)".includes(q) || "vide".includes(q);
      return n.toLowerCase().includes(q);
    });
  }, [clientOptions, valueSearch]);

  const filteredEtatOptions = useMemo(() => {
    const q = valueSearch.trim().toLowerCase();
    if (!q) return etatOptions;
    return etatOptions.filter((k) => {
      if (k === ETAT_EMPTY_KEY) return "(vide)".includes(q) || "vide".includes(q);
      if (k.startsWith("debit:")) {
        const v = k.slice("debit:".length);
        return debitStatusLabel(v as (typeof DEBIT_STATUS_VALUES)[number]).toLowerCase().includes(q);
      }
      if (k.startsWith("credit:")) {
        const v = k.slice("credit:".length);
        return creditStatusLabel(v as (typeof CREDIT_STATUS_VALUES)[number]).toLowerCase().includes(q);
      }
      return k.toLowerCase().includes(q);
    });
  }, [etatOptions, valueSearch]);

  const applyDraft = useCallback(() => {
    onApply(draft);
    onClose();
  }, [draft, onApply, onClose]);

  /** Sous le bandeau d’en-tête de la colonne, centré sur le titre (comme un tableur). */
  const belowHeader = anchor.top + anchor.height;
  const menuWidth = 420;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 900;
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const panelWidth = Math.min(menuWidth, viewportW - 16);
  /** Hauteur max du panneau (liste longue = scroll interne uniquement). */
  const PANEL_MAX_HEIGHT_PX = 480;
  const spaceBelow = Math.max(0, viewportH - belowHeader - 20);
  const maxPanelHeight = Math.min(PANEL_MAX_HEIGHT_PX, spaceBelow, viewportH - 16);
  const maxLeft = Math.max(8, viewportW - panelWidth - 8);
  const idealLeft = anchor.left + anchor.width / 2 - panelWidth / 2;
  const left = Math.min(Math.max(8, idealLeft), maxLeft);

  /** Colonnes avec liste de valeurs : le panneau prend la hauteur dispo, seule la liste défile. */
  const valueListColumn =
    columnId === "id" ||
    columnId === "bank_name" ||
    columnId === "account_status_name" ||
    columnId === "company_name" ||
    columnId === "type" ||
    columnId === "processed_by_user_name" ||
    columnId === "fournisseur" ||
    columnId === "client_name" ||
    columnId === "debit_status";

  const valueListUlClass =
    "min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 [scrollbar-gutter:stable]";

  const sectionTitle = (t: string) => (
    <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
      {t}
    </div>
  );

  /** Tri par défaut = date desc : ne pas surligner aussi « Z à A » sur la colonne Date (même sens, double sélection). */
  const defaultSortExclusiveForThisColumn =
    sortable &&
    isDefaultTransactionTableSort(sortState) &&
    columnId === DEFAULT_TRANSACTION_TABLE_SORT.column;

  const ascActive =
    sortable &&
    sortState != null &&
    sortState.column === columnId &&
    sortState.direction === "asc";
  const descActive =
    sortable &&
    !defaultSortExclusiveForThisColumn &&
    sortState != null &&
    sortState.column === columnId &&
    sortState.direction === "desc";
  const defaultOrderActive = sortable && isDefaultTransactionTableSort(sortState);
  const sortRowClass = (active: boolean) =>
    `w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
      active
        ? "bg-[var(--primary-muted)] font-medium text-[var(--primary)] ring-1 ring-inset ring-[var(--primary-muted-border)]"
        : "text-[var(--foreground)] hover:bg-[var(--muted)]"
    }`;

  const sortBlock =
    sortable && columnId !== "rowNum" ? (
      <>
        {sectionTitle("Tri")}
        <div className="flex flex-col gap-0.5 px-3">
          <button type="button" className={sortRowClass(ascActive)} onClick={() => onSortAsc()}>
            Trier de A à Z
          </button>
          <button type="button" className={sortRowClass(descActive)} onClick={() => onSortDesc()}>
            Trier de Z à A
          </button>
          {onSortDefault != null ? (
            <button
              type="button"
              className={sortRowClass(defaultOrderActive)}
              onClick={() => {
                onSortDefault();
              }}
            >
              Ordre par défaut
            </button>
          ) : null}
        </div>
        <div className="mx-3 my-2 border-t border-[var(--border)]" />
      </>
    ) : null;

  let body: ReactNode = null;

  if (columnId === "bank_name") {
    const allNames = bankNameOptions;
    const selected =
      draft.bankNameFilter === null ? new Set(allNames) : new Set(draft.bankNameFilter.names);
    const toggle = (name: string) => {
      const next = new Set(selected);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setDraft({
        ...draft,
        bankNameFilter: { mode: "include", names: [...next] },
      });
    };
    const selectAll = () =>
      setDraft({ ...draft, bankNameFilter: { mode: "include", names: [...allNames] } });
    const clearAll = () => setDraft({ ...draft, bankNameFilter: { mode: "include", names: [] } });
    const displayBank = (n: string) => (n === BANK_EMPTY_KEY ? "(Vide)" : n);
    body = (
      <>
        <div className="shrink-0">
          {sectionTitle("Filtrer par banque")}
          <div className="flex flex-wrap gap-2 px-3 pb-2 text-xs">
            <button type="button" className="text-[var(--primary)] hover:underline" onClick={selectAll}>
              Tout sélectionner ({allNames.length})
            </button>
            <button type="button" className="text-[var(--primary)] hover:underline" onClick={clearAll}>
              Effacer
            </button>
          </div>
          <p className="px-3 pb-1 text-xs text-[var(--muted-foreground)]">
            Affichage de {filteredBankNameOptions.length}
          </p>
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
        </div>
        <ul className={valueListUlClass}>
          {filteredBankNameOptions.map((n) => (
            <li key={n}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={selected.has(n)}
                  onChange={() => toggle(n)}
                  className="rounded border-[var(--border)]"
                />
                <span className="truncate">{displayBank(n)}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="shrink-0 px-3 pb-2 text-[11px] text-[var(--muted-foreground)]">
          Établissements présents dans les lignes chargées (pas les comptes individuels).
        </p>
      </>
    );
  } else if (columnId === "account_status_name") {
    const allNames = accountStatusOptions;
    const selected =
      draft.accountStatusFilter === null
        ? new Set(allNames)
        : new Set(draft.accountStatusFilter.names);
    const toggle = (name: string) => {
      const next = new Set(selected);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setDraft({
        ...draft,
        accountStatusFilter: { mode: "include", names: [...next] },
      });
    };
    const selectAll = () =>
      setDraft({ ...draft, accountStatusFilter: { mode: "include", names: [...allNames] } });
    const clearAll = () =>
      setDraft({ ...draft, accountStatusFilter: { mode: "include", names: [] } });
    const displayStatus = (n: string) => (n === ACCOUNT_STATUS_EMPTY_KEY ? "(Vide)" : n);
    body = (
      <>
        <div className="shrink-0">
          {sectionTitle("Filtrer par statut du compte")}
          <div className="flex flex-wrap gap-2 px-3 pb-2 text-xs">
            <button type="button" className="text-[var(--primary)] hover:underline" onClick={selectAll}>
              Tout sélectionner ({allNames.length})
            </button>
            <button type="button" className="text-[var(--primary)] hover:underline" onClick={clearAll}>
              Effacer
            </button>
          </div>
          <p className="px-3 pb-1 text-xs text-[var(--muted-foreground)]">
            Affichage de {filteredAccountStatusOptions.length}
          </p>
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
        </div>
        <ul className={valueListUlClass}>
          {filteredAccountStatusOptions.map((n) => (
            <li key={n}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={selected.has(n)}
                  onChange={() => toggle(n)}
                  className="rounded border-[var(--border)]"
                />
                <span className="truncate">{displayStatus(n)}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="shrink-0 px-3 pb-2 text-[11px] text-[var(--muted-foreground)]">
          Statuts issus du compte bancaire (lignes chargées).
        </p>
      </>
    );
  } else if (columnId === "company_name") {
    const allNames = companyOptions;
    const selected =
      draft.companyFilter === null ? new Set(allNames) : new Set(draft.companyFilter.names);
    const toggle = (name: string) => {
      const next = new Set(selected);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setDraft({
        ...draft,
        companyFilter: { mode: "include", names: [...next] },
      });
    };
    const selectAll = () =>
      setDraft({ ...draft, companyFilter: { mode: "include", names: [...allNames] } });
    const clearAll = () => setDraft({ ...draft, companyFilter: { mode: "include", names: [] } });
    const displayCompany = (n: string) => (n === COMPANY_EMPTY_KEY ? "(Vide)" : n);
    body = (
      <>
        <div className="shrink-0">
          {sectionTitle("Filtrer par valeurs")}
          <div className="flex flex-wrap gap-2 px-3 pb-2 text-xs">
            <button type="button" className="text-[var(--primary)] hover:underline" onClick={selectAll}>
              Tout sélectionner ({allNames.length})
            </button>
            <button type="button" className="text-[var(--primary)] hover:underline" onClick={clearAll}>
              Effacer
            </button>
          </div>
          <p className="px-3 pb-1 text-xs text-[var(--muted-foreground)]">Affichage de {filteredCompanyOptions.length}</p>
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
        </div>
        <ul className={valueListUlClass}>
          {filteredCompanyOptions.map((n) => (
            <li key={n}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={selected.has(n)}
                  onChange={() => toggle(n)}
                  className="rounded border-[var(--border)]"
                />
                <span className="truncate">{displayCompany(n)}</span>
              </label>
            </li>
          ))}
        </ul>
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
        <div className="shrink-0">
          {sectionTitle("Filtrer par valeurs")}
          <div className="flex flex-wrap gap-2 px-3 pb-2 text-xs">
            <button type="button" className="text-[var(--primary)] hover:underline" onClick={selectAll}>
              Tout sélectionner ({TRANSACTION_TYPES.length})
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
        </div>
        <ul className={valueListUlClass}>
          {TRANSACTION_TYPES.filter((t) =>
            transactionTypeLabel(t).toLowerCase().includes(valueSearch.trim().toLowerCase())
          ).map((t) => (
            <li key={t}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={selected.has(t)}
                  onChange={() => toggle(t)}
                  className="rounded border-[var(--border)]"
                />
                {transactionTypeLabel(t)}
              </label>
            </li>
          ))}
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
        {sectionTitle("Montant")}
        <div className="px-3 pb-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            Type
            <select
              value={draft.amountFilterMode}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  amountFilterMode: e.target.value as TransactionAmountFilterMode,
                })
              }
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
            >
              <option value="signed">Signé (débit −, crédit +)</option>
              <option value="DEBIT">Débit (montant affiché en valeur absolue)</option>
              <option value="CREDIT">Crédit</option>
            </select>
          </label>
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted-foreground)]">
            Les bornes min / max s&apos;appliquent au type choisi. En « Débit » ou « Crédit », seules les lignes de ce type
            sont conservées.
          </p>
        </div>
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
        <div className="shrink-0">
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
        </div>
        <ul className={valueListUlClass}>
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
  } else if (columnId === "id") {
    body = (
      <>
        {sectionTitle("Filtrer par condition")}
        <div className="px-3 pb-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            L&apos;ID contient
            <input
              type="search"
              value={draft.idContains}
              onChange={(e) => setDraft({ ...draft, idContains: e.target.value })}
              placeholder="Rechercher dans l&apos;ID…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            />
          </label>
        </div>
      </>
    );
  } else if (columnId === "fournisseur") {
    const allNames = fournisseurOptions;
    const selected =
      draft.fournisseurFilter === null ? new Set(allNames) : new Set(draft.fournisseurFilter.names);
    const toggle = (name: string) => {
      const next = new Set(selected);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setDraft({
        ...draft,
        fournisseurFilter: { mode: "include", names: [...next] },
      });
    };
    const selectAll = () =>
      setDraft({ ...draft, fournisseurFilter: { mode: "include", names: [...allNames] } });
    const clearAll = () => setDraft({ ...draft, fournisseurFilter: { mode: "include", names: [] } });
    const displayName = (n: string) => (n === FOURNISSEUR_EMPTY_KEY ? "(Vide)" : n);
    body = (
      <>
        <div className="shrink-0">
          {sectionTitle("Filtrer par valeurs")}
          <div className="flex flex-wrap gap-2 px-3 pb-2 text-xs">
            <button type="button" className="text-[var(--primary)] hover:underline" onClick={selectAll}>
              Tout sélectionner ({allNames.length})
            </button>
            <button type="button" className="text-[var(--primary)] hover:underline" onClick={clearAll}>
              Effacer
            </button>
          </div>
          <p className="px-3 pb-1 text-xs text-[var(--muted-foreground)]">Affichage de {filteredFournisseurOptions.length}</p>
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
        </div>
        <ul className={valueListUlClass}>
          {filteredFournisseurOptions.map((n) => (
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
  } else if (columnId === "client_name") {
    const allNames = clientOptions;
    const selected = draft.clientFilter === null ? new Set(allNames) : new Set(draft.clientFilter.names);
    const toggle = (name: string) => {
      const next = new Set(selected);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setDraft({
        ...draft,
        clientFilter: { mode: "include", names: [...next] },
      });
    };
    const selectAll = () =>
      setDraft({ ...draft, clientFilter: { mode: "include", names: [...allNames] } });
    const clearAll = () => setDraft({ ...draft, clientFilter: { mode: "include", names: [] } });
    const displayName = (n: string) => (n === CLIENT_EMPTY_KEY ? "(Vide)" : n);
    body = (
      <>
        <div className="shrink-0">
          {sectionTitle("Filtrer par valeurs")}
          <div className="flex flex-wrap gap-2 px-3 pb-2 text-xs">
            <button type="button" className="text-[var(--primary)] hover:underline" onClick={selectAll}>
              Tout sélectionner ({allNames.length})
            </button>
            <button type="button" className="text-[var(--primary)] hover:underline" onClick={clearAll}>
              Effacer
            </button>
          </div>
          <p className="px-3 pb-1 text-xs text-[var(--muted-foreground)]">Affichage de {filteredClientOptions.length}</p>
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
        </div>
        <ul className={valueListUlClass}>
          {filteredClientOptions.map((n) => (
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
  } else if (columnId === "created_at") {
    body = (
      <>
        {sectionTitle("Période de création")}
        <div className="space-y-2 px-3 pb-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            Du
            <input
              type="date"
              value={draft.createdAtFrom}
              onChange={(e) => setDraft({ ...draft, createdAtFrom: e.target.value })}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            Au
            <input
              type="date"
              value={draft.createdAtTo}
              onChange={(e) => setDraft({ ...draft, createdAtTo: e.target.value })}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </>
    );
  } else if (columnId === "debit_status") {
    const allNames = etatOptions;
    const selected = draft.etatFilter === null ? new Set(allNames) : new Set(draft.etatFilter.names);
    const toggle = (name: string) => {
      const next = new Set(selected);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setDraft({
        ...draft,
        etatFilter: { mode: "include", names: [...next] },
      });
    };
    const selectAll = () =>
      setDraft({ ...draft, etatFilter: { mode: "include", names: [...allNames] } });
    const clearAll = () => setDraft({ ...draft, etatFilter: { mode: "include", names: [] } });
    const displayEtat = (k: string) => {
      if (k === ETAT_EMPTY_KEY) return "(Vide)";
      if (k.startsWith("debit:")) {
        const v = k.slice("debit:".length) as (typeof DEBIT_STATUS_VALUES)[number];
        return debitStatusLabel(v);
      }
      if (k.startsWith("credit:")) {
        const v = k.slice("credit:".length) as (typeof CREDIT_STATUS_VALUES)[number];
        return creditStatusLabel(v);
      }
      return k;
    };
    body = (
      <>
        <div className="shrink-0">
          {sectionTitle("Filtrer par état")}
          <div className="flex flex-wrap gap-2 px-3 pb-2 text-xs">
            <button type="button" className="text-[var(--primary)] hover:underline" onClick={selectAll}>
              Tout sélectionner ({allNames.length})
            </button>
            <button type="button" className="text-[var(--primary)] hover:underline" onClick={clearAll}>
              Effacer
            </button>
          </div>
          <p className="px-3 pb-1 text-xs text-[var(--muted-foreground)]">Affichage de {filteredEtatOptions.length}</p>
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
        </div>
        <ul className={valueListUlClass}>
          {filteredEtatOptions.map((n) => (
            <li key={n}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={selected.has(n)}
                  onChange={() => toggle(n)}
                  className="rounded border-[var(--border)]"
                />
                <span className="truncate">{displayEtat(n)}</span>
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
      className="fixed z-[100] flex min-h-0 max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] py-2 shadow-lg"
      style={{
        top: belowHeader + 4,
        left,
        width: panelWidth,
        maxHeight: maxPanelHeight,
        ...(valueListColumn ? { height: maxPanelHeight } : {}),
      }}
      role="dialog"
      aria-label="Filtre de colonne"
    >
      {sortBlock ? <div className="shrink-0">{sortBlock}</div> : null}
      <div
        className={
          valueListColumn
            ? "flex min-h-0 flex-1 flex-col overflow-hidden px-0.5"
            : "shrink-0 px-0.5"
        }
      >
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
