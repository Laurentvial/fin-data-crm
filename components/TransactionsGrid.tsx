"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DataEditor,
  GridCellKind,
  getDefaultTheme,
  drawTextCell,
  roundedRect,
  interpolateColors,
  type GridColumn,
  type GridCell,
  type Item,
  type GridSelection,
  type EditableGridCell,
  CompactSelection,
  type Theme,
  type CustomCell,
  type CustomRenderer,
  type DrawArgs,
  type HeaderClickedEventArgs,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import type { AccountType, BankAccount, Fournisseur, Transaction, TransactionType } from "@/lib/types";
import { TransactionColumnFilterMenu, type FilterMenuAnchor } from "@/components/TransactionColumnFilterMenu";
import {
  DEFAULT_TRANSACTION_TABLE_SORT,
  isDefaultTransactionTableSort,
} from "@/lib/transaction-sort";
import {
  columnHasActiveFilter,
  type TransactionFilterValues,
} from "@/lib/transaction-filters";
import {
  DEBIT_STATUS_VALUES,
  debitStatusLabel,
  debitStatusPillStyle,
  type DebitTransactionStatus,
} from "@/lib/debit-status";
import { isCreditLikeType, transactionTypeLabel } from "@/lib/transaction-type";

const LIGHT_THEME: Partial<Theme> = {
  accentColor: "#0d9488",
  accentLight: "#ccfbf1",
  textDark: "#171717",
  textMedium: "#64748b",
  textLight: "#94a3b8",
  textHeader: "#64748b",
  bgCell: "#ffffff",
  bgCellMedium: "#f1f5f9",
  bgHeader: "#f1f5f9",
  borderColor: "#e2e8f0",
};

const DARK_THEME: Partial<Theme> = {
  accentColor: "#2dd4bf",
  accentLight: "#134e4a",
  textDark: "#f1f5f9",
  textMedium: "#94a3b8",
  textLight: "#cbd5e1",
  textHeader: "#94a3b8",
  bgCell: "#0f172a",
  bgCellMedium: "#1e293b",
  bgHeader: "#1e293b",
  borderColor: "#334155",
};

/** Matches `app/globals.css` / Geist so canvas headers align with the rest of the UI. */
const FONT_FAMILY_FALLBACK =
  'Geist, "Geist Fallback", ui-sans-serif, system-ui, sans-serif';

/** Glide builds `headerFontFull` from `headerFontStyle` + `fontFamily`. Size scales with grid zoom. */
function glideHeaderFontStyle(scale: number, weight = 650): string {
  return `${weight} ${Math.max(12, Math.round(15 * scale))}px`;
}

function useResolvedTheme(): Partial<Theme> {
  const [theme, setTheme] = useState<Partial<Theme>>(LIGHT_THEME);
  useEffect(() => {
    const root = document.documentElement;
    const s = getComputedStyle(root);
    const get = (v: string) => s.getPropertyValue(v).trim();
    const prefersDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const base = prefersDark ? DARK_THEME : LIGHT_THEME;
    const bodyFont = getComputedStyle(document.body).fontFamily.trim();
    const resolved: Partial<Theme> = {
      ...base,
      accentColor: get("--primary") || base.accentColor,
      accentLight: get("--primary-muted") || base.accentLight,
      textDark: get("--foreground") || base.textDark,
      textMedium: get("--muted-foreground") || base.textMedium,
      textHeader: get("--foreground") || base.textHeader,
      bgCell: get("--background") || base.bgCell,
      bgCellMedium: get("--muted") || base.bgCellMedium,
      bgHeader: get("--muted") || base.bgHeader,
      borderColor: get("--border") || base.borderColor,
      fontFamily: bodyFont || FONT_FAMILY_FALLBACK,
    };
    // Sync grid theme tokens from document CSS once on mount.
    queueMicrotask(() => setTheme(resolved));
  }, []);
  return theme;
}

const AMOUNT_COL = 6; // Column index for amount (used for selection sum)

const SORTABLE_FIELDS = new Set<string>([
  "id",
  "transaction_date",
  "account_status_name",
  "bank_name",
  "company_name",
  "amount",
  "type",
  "debit_status",
  "description",
  "client_name",
  "created_at",
  "processed_by_user_name",
]);

const COLUMN_FILTER_IDS = new Set<string>([
  "transaction_date",
  "account_status_name",
  "bank_name",
  "company_name",
  "amount",
  "type",
  "debit_status",
  "description",
  "client_name",
  "processed_by_user_name",
]);

/** Stats de sélection : somme nette, débits / crédits (cellules Montant), lignes touchées. */
export interface TransactionSelectionStats {
  sum: number;
  /** Lignes dont la colonne « Montant » intersecte la sélection (aligné sur sum / débits / crédits). */
  rowCount: number;
  /** Somme des montants bruts des lignes DEBIT (valeurs positives). */
  debitsTotal: number;
  /** Somme des montants des lignes CREDIT. */
  creditsTotal: number;
  /** IDs des transactions cochées dans la colonne de gauche (facture simple ou groupée). */
  selectedTransactionIds: string[];
}

/** Glide `onHeaderMenuClick` reçoit le rectangle d’en-tête déjà en coordonnées viewport (voir getBoundsForItem). */
function viewportHeaderBoundsToAnchor(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): FilterMenuAnchor {
  return {
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

interface TransactionsGridProps {
  transactions: Transaction[];
  loading?: boolean;
  /** True while appending the next page (scroll end). */
  loadingMore?: boolean;
  /** Whether more rows can be loaded from the API. */
  hasMore?: boolean;
  /** Called when the user scrolls near the bottom of the grid. */
  onLoadMore?: () => void;
  /** Zoom level in % (50–150). Scales row height and typography. */
  zoom?: number;
  onCellValueChanged?: (id: string, field: string, value: unknown) => Promise<void>;
  onSelectionStatsChange?: (stats: TransactionSelectionStats | null) => void;
  onDelete?: (id: string) => Promise<void>;
  /** Tri explicite (menus de colonne). */
  onSortDirect?: (field: string, direction: "asc" | "desc") => void;
  /** Rétablit le tri par défaut (menu colonne). */
  onSortDefault?: () => void;
  /** Tri actuel (mise en évidence dans le menu filtre). */
  sortState?: { column: string; direction: "asc" | "desc" };
  /** Filtres (menus type Google Sheets). */
  filterValues?: TransactionFilterValues;
  onApplyFilters?: (next: TransactionFilterValues) => void;
  bankAccounts?: BankAccount[];
  /** Données triées avant filtres client — pour les listes de valeurs. */
  transactionsForFilterOptions?: Transaction[];
  /** Liste des fournisseurs (Paramètres) pour la colonne et l’éditeur. */
  fournisseurs?: Fournisseur[];
  /** Clients = account_types (Paramètres › Clients) pour la colonne Client. */
  settingsClients?: AccountType[];
  /** Création rapide « + Nouveau fournisseur… » dans l’éditeur de cellule (retourner null si annulé). */
  onQuickCreateFournisseur?: () => Promise<Fournisseur | null>;
  /** Création rapide « + Nouveau client… » dans l’éditeur de cellule (retourner null si annulé). */
  onQuickCreateSettingsClient?: () => Promise<AccountType | null>;
  /** Incrémenter après une action parent (ex. suppression groupée) pour effacer coches / stats. */
  selectionResetNonce?: number;
  /** Ouvre le modal d’appariement crédit interne (colonne Type). */
  onBeginInternalCreditPair?: (creditId: string) => void;
}

interface DateCellData {
  type: "date";
  value: string; // YYYY-MM-DD
}

function formatDateDisplay(value: string): string {
  if (!value) return "";
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d}/${m}/${y}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Convert to YYYY-MM-DD for API/storage */
function parseDateToApiFormat(val: string): string {
  const trimmed = val.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const date = new Date(trimmed);
  if (!Number.isNaN(date.getTime())) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return trimmed;
}

const dateCellRenderer: CustomRenderer<CustomCell<DateCellData>> = {
  kind: GridCellKind.Custom,
  isMatch: (cell): cell is CustomCell<DateCellData> =>
    cell.kind === GridCellKind.Custom &&
    (cell as CustomCell<DateCellData>).data?.type === "date",
  draw: (args: DrawArgs<CustomCell<DateCellData>>, cell) => {
    const display = formatDateDisplay(cell.data.value);
    drawTextCell(args as Parameters<typeof drawTextCell>[0], display);
  },
  provideEditor: () => (p) => {
    const rawValue = p.value.data.value || "";
    const apiFormat = /^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? rawValue : parseDateToApiFormat(rawValue);
    const theme = p.theme;
    const textRef = React.useRef<HTMLInputElement>(null);
    const dateRef = React.useRef<HTMLInputElement>(null);
    const [displayValue, setDisplayValue] = React.useState(() => formatDateDisplay(apiFormat));
    const finish = (val?: string) => {
      const toSave = val ?? (parseDateToApiFormat(textRef.current?.value ?? "") || p.value.data.value);
      const next = { ...p.value, data: { type: "date" as const, value: toSave } };
      p.onChange(next);
      p.onFinishedEditing(next);
    };
    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setDisplayValue(val);
      const parsed = parseDateToApiFormat(val);
      if (parsed) p.onChange({ ...p.value, data: { type: "date" as const, value: parsed } });
    };
    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setDisplayValue(formatDateDisplay(val));
      const next = { ...p.value, data: { type: "date" as const, value: val } };
      p.onChange(next);
      p.onFinishedEditing(next);
    };
    const inputStyle = {
      height: 36,
      padding: "6px 8px" as const,
      border: `1px solid ${theme.borderColor ?? "#e2e8f0"}`,
      borderRadius: 6,
      fontSize: 14,
      fontFamily: "inherit" as const,
      background: theme.bgCell ?? "#fff",
      color: theme.textDark ?? "#171717",
    };
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 160 }}>
        <input
          ref={textRef}
          type="text"
          value={displayValue}
          onChange={handleTextChange}
          placeholder="jj/mm/aaaa"
          onBlur={(e) => {
            if (!e.relatedTarget || !e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) {
              finish();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              finish();
            }
            if (e.key === "Escape") p.onFinishedEditing(undefined);
          }}
          autoFocus
          className="focus:outline-none focus:border-[var(--muted)]"
          style={{ ...inputStyle, flex: 1, minWidth: 100 }}
        />
        <div style={{ position: "relative" }}>
          <input
            ref={dateRef}
            type="date"
            value={apiFormat}
            onChange={handleDateChange}
            style={{
              ...inputStyle,
              position: "absolute",
              inset: 0,
              opacity: 0,
              cursor: "pointer",
              width: "100%",
              height: "100%",
            }}
            title="Ouvrir le calendrier"
          />
          <span
            role="button"
            tabIndex={0}
            onClick={() => dateRef.current?.showPicker?.()}
            onKeyDown={(e) => e.key === "Enter" && dateRef.current?.showPicker?.()}
            className="focus:outline-none focus:border-[var(--muted)]"
            style={{
              ...inputStyle,
              width: 36,
              minWidth: 36,
              padding: 4,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Calendrier"
          >
            📅
          </span>
        </div>
      </div>
    );
  },
  getAccessibilityString: (cell: CustomCell<DateCellData>) => formatDateDisplay(cell.data.value),
  onPaste: (val) => {
    const parsed = parseDateToApiFormat(String(val).trim());
    if (parsed) return { type: "date" as const, value: parsed };
    return undefined;
  },
} as CustomRenderer<CustomCell<DateCellData>>;

interface FournisseurCellData {
  type: "fournisseur";
  id: string | null;
}

const CREATE_FOURNISSEUR_SENTINEL = "__create_fournisseur__";

function FournisseurSelectEditor({
  cellProps,
  fournisseurs,
  onQuickCreate,
}: {
  cellProps: {
    value: CustomCell<FournisseurCellData>;
    onChange: (cell: CustomCell<FournisseurCellData>) => void;
    onFinishedEditing: (cell: CustomCell<FournisseurCellData> | undefined) => void;
    theme: Theme;
  };
  fournisseurs: Fournisseur[];
  onQuickCreate?: () => Promise<Fournisseur | null>;
}) {
  const { value, onChange, onFinishedEditing, theme: gridTheme } = cellProps;
  const currentId = value.data.id ?? "";
  const [busy, setBusy] = useState(false);
  const inputStyle: React.CSSProperties = {
    height: 36,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 8,
    border: `1px solid ${gridTheme.borderColor ?? "#e2e8f0"}`,
    borderRadius: 6,
    fontSize: 14,
    fontFamily: "inherit",
    backgroundColor: gridTheme.bgCell ?? "#fff",
    color: gridTheme.textDark ?? "#171717",
    width: "100%",
    minWidth: 160,
    maxWidth: 360,
  };
  return (
    <select
      autoFocus
      disabled={busy}
      value={currentId}
      style={inputStyle}
      className="focus:outline-none focus:border-[var(--muted)]"
      onChange={async (e) => {
        const v = e.target.value;
        if (v === CREATE_FOURNISSEUR_SENTINEL) {
          if (!onQuickCreate || busy) return;
          setBusy(true);
          try {
            const created = await onQuickCreate();
            if (created) {
              const next = {
                ...value,
                data: { type: "fournisseur" as const, id: created.id },
              };
              onChange(next);
              onFinishedEditing(next);
            }
          } finally {
            setBusy(false);
          }
          return;
        }
        const nextId = v === "" ? null : v;
        const next = { ...value, data: { type: "fournisseur" as const, id: nextId } };
        onChange(next);
        onFinishedEditing(next);
      }}
    >
      <option value="">—</option>
      {fournisseurs.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
      {onQuickCreate ? (
        <option value={CREATE_FOURNISSEUR_SENTINEL}>+ Nouveau fournisseur…</option>
      ) : null}
    </select>
  );
}

function createFournisseurRenderer(
  fournisseurs: Fournisseur[],
  opts?: { onQuickCreate?: () => Promise<Fournisseur | null> }
): CustomRenderer<CustomCell<FournisseurCellData>> {
  return {
    kind: GridCellKind.Custom,
    isMatch: (cell): cell is CustomCell<FournisseurCellData> =>
      cell.kind === GridCellKind.Custom &&
      (cell as CustomCell<FournisseurCellData>).data?.type === "fournisseur",
    draw: (args: DrawArgs<CustomCell<FournisseurCellData>>, cell) => {
      const fid = cell.data.id;
      const label = fid ? fournisseurs.find((f) => f.id === fid)?.name ?? "" : "";
      drawTextCell(args as Parameters<typeof drawTextCell>[0], label);
    },
    provideEditor: () => (p) => (
      <FournisseurSelectEditor
        cellProps={p}
        fournisseurs={fournisseurs}
        onQuickCreate={opts?.onQuickCreate}
      />
    ),
    getAccessibilityString: (cell: CustomCell<FournisseurCellData>) => {
      const fid = cell.data.id;
      return fid ? fournisseurs.find((f) => f.id === fid)?.name ?? "" : "";
    },
  } as CustomRenderer<CustomCell<FournisseurCellData>>;
}

interface SettingsClientCellData {
  type: "settings_client";
  /** Surcharge (account_types) ; null = client du compte (`account_type_id`). */
  overrideId: string | null;
  displayName: string;
  defaultDisplayName: string;
}

const CREATE_CLIENT_SENTINEL = "__create_client__";

function SettingsClientSelectEditor({
  cellProps,
  sortedClients,
  onQuickCreate,
}: {
  cellProps: {
    value: CustomCell<SettingsClientCellData>;
    onChange: (cell: CustomCell<SettingsClientCellData>) => void;
    onFinishedEditing: (cell: CustomCell<SettingsClientCellData> | undefined) => void;
    theme: Theme;
  };
  sortedClients: AccountType[];
  onQuickCreate?: () => Promise<AccountType | null>;
}) {
  const { value, onChange, onFinishedEditing, theme: gridTheme } = cellProps;
  const currentOverride = value.data.overrideId ?? "";
  const [busy, setBusy] = useState(false);
  const inputStyle: React.CSSProperties = {
    height: 36,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 8,
    border: `1px solid ${gridTheme.borderColor ?? "#e2e8f0"}`,
    borderRadius: 6,
    fontSize: 14,
    fontFamily: "inherit",
    backgroundColor: gridTheme.bgCell ?? "#fff",
    color: gridTheme.textDark ?? "#171717",
    width: "100%",
    minWidth: 160,
    maxWidth: 360,
  };
  return (
    <select
      autoFocus
      disabled={busy}
      value={currentOverride}
      style={inputStyle}
      className="focus:outline-none focus:border-[var(--muted)]"
      onChange={async (e) => {
        const v = e.target.value;
        if (v === CREATE_CLIENT_SENTINEL) {
          if (!onQuickCreate || busy) return;
          setBusy(true);
          try {
            const created = await onQuickCreate();
            if (created) {
              const next = {
                ...value,
                data: {
                  type: "settings_client" as const,
                  overrideId: created.id,
                  displayName: created.name,
                  defaultDisplayName: value.data.defaultDisplayName,
                },
              };
              onChange(next);
              onFinishedEditing(next);
            }
          } finally {
            setBusy(false);
          }
          return;
        }
        const nextId = v === "" ? null : v;
        const label =
          nextId === null
            ? (value.data.defaultDisplayName ?? "")
            : (sortedClients.find((c) => c.id === nextId)?.name ?? value.data.displayName);
        const next = {
          ...value,
          data: {
            type: "settings_client" as const,
            overrideId: nextId,
            displayName: label,
            defaultDisplayName: value.data.defaultDisplayName,
          },
        };
        onChange(next);
        onFinishedEditing(next);
      }}
    >
      <option value="">Compte (défaut)</option>
      {sortedClients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      {onQuickCreate ? <option value={CREATE_CLIENT_SENTINEL}>+ Nouveau client…</option> : null}
    </select>
  );
}

function createSettingsClientRenderer(
  settingsClients: AccountType[],
  opts?: { onQuickCreate?: () => Promise<AccountType | null> }
): CustomRenderer<CustomCell<SettingsClientCellData>> {
  const sorted = [...settingsClients].sort((a, b) => a.sort_order - b.sort_order);
  return {
    kind: GridCellKind.Custom,
    isMatch: (cell): cell is CustomCell<SettingsClientCellData> =>
      cell.kind === GridCellKind.Custom &&
      (cell as CustomCell<SettingsClientCellData>).data?.type === "settings_client",
    draw: (args: DrawArgs<CustomCell<SettingsClientCellData>>, cell) => {
      drawTextCell(args as Parameters<typeof drawTextCell>[0], cell.data.displayName ?? "");
    },
    provideEditor: () => (p) => (
      <SettingsClientSelectEditor
        cellProps={p}
        sortedClients={sorted}
        onQuickCreate={opts?.onQuickCreate}
      />
    ),
    getAccessibilityString: (cell: CustomCell<SettingsClientCellData>) => cell.data.displayName ?? "",
  } as CustomRenderer<CustomCell<SettingsClientCellData>>;
}

interface DebitStatusCellData {
  type: "debit_status";
  value: "" | DebitTransactionStatus;
  editable: boolean;
}

function createDebitStatusRenderer(): CustomRenderer<CustomCell<DebitStatusCellData>> {
  return {
    kind: GridCellKind.Custom,
    isMatch: (cell): cell is CustomCell<DebitStatusCellData> =>
      cell.kind === GridCellKind.Custom &&
      (cell as CustomCell<DebitStatusCellData>).data?.type === "debit_status",
    draw: (args: DrawArgs<CustomCell<DebitStatusCellData>>, cell) => {
      const v = cell.data.value;
      if (!v) {
        const { ctx, rect, theme } = args;
        ctx.save();
        ctx.fillStyle = theme.textMedium ?? theme.textLight ?? "#94a3b8";
        ctx.font = `${theme.baseFontStyle} ${theme.fontFamily}`;
        ctx.textBaseline = "middle";
        ctx.fillText("—", rect.x + 8, rect.y + rect.height / 2);
        ctx.restore();
        return;
      }
      const pill = debitStatusPillStyle(v);
      if (!pill) {
        drawTextCell(args as Parameters<typeof drawTextCell>[0], "");
        return;
      }
      const { ctx, rect, theme } = args;
      ctx.save();
      const padX = 8;
      const h = Math.min(26, Math.max(20, rect.height - 10));
      const y = rect.y + (rect.height - h) / 2;
      ctx.font = `${theme.baseFontStyle} ${theme.fontFamily}`;
      const w = ctx.measureText(pill.label).width + padX * 2;
      const x = rect.x + 4;
      const r = Math.min(6, h / 2);
      roundedRect(ctx, x, y, w, h, r);
      ctx.fillStyle = pill.bg;
      ctx.fill();
      ctx.fillStyle = pill.fg;
      ctx.textBaseline = "middle";
      ctx.fillText(pill.label, x + padX, y + h / 2);
      ctx.restore();
    },
    provideEditor: () => (p) => {
      const theme = p.theme;
      const current = p.value.data.value === "" ? "" : p.value.data.value;
      const inputStyle: React.CSSProperties = {
        height: 36,
        paddingTop: 6,
        paddingBottom: 6,
        paddingLeft: 8,
        border: `1px solid ${theme.borderColor ?? "#e2e8f0"}`,
        borderRadius: 6,
        fontSize: 14,
        fontFamily: "inherit",
        backgroundColor: theme.bgCell ?? "#fff",
        color: theme.textDark ?? "#171717",
        width: "100%",
        minWidth: 140,
        maxWidth: 280,
      };
      return (
        <select
          autoFocus
          value={current}
          style={inputStyle}
          className="focus:outline-none focus:border-[var(--muted)]"
          onChange={(e) => {
            const v = e.target.value;
            const nextVal: "" | DebitTransactionStatus =
              v === "" ? "" : (v as DebitTransactionStatus);
            const next = {
              ...p.value,
              data: { type: "debit_status" as const, value: nextVal, editable: true as const },
            } satisfies CustomCell<DebitStatusCellData>;
            p.onChange(next);
            p.onFinishedEditing(next);
          }}
        >
          <option value="">—</option>
          {DEBIT_STATUS_VALUES.map((k) => (
            <option key={k} value={k}>
              {debitStatusLabel(k)}
            </option>
          ))}
        </select>
      );
    },
    getAccessibilityString: (cell: CustomCell<DebitStatusCellData>) => {
      const v = cell.data.value;
      if (!v) return "Aucun statut";
      return debitStatusLabel(v);
    },
  } as CustomRenderer<CustomCell<DebitStatusCellData>>;
}

interface TransactionTypeCellData {
  type: "txn_type";
  value: TransactionType;
  transactionId: string;
  /** Ligne CREDIT éligible pour ouvrir le modal crédit interne. */
  canBeInternalSource: boolean;
}

function createTransactionTypeRenderer(
  onBeginInternalCreditPair?: (creditId: string) => void
): CustomRenderer<CustomCell<TransactionTypeCellData>> {
  return {
    kind: GridCellKind.Custom,
    isMatch: (cell): cell is CustomCell<TransactionTypeCellData> =>
      cell.kind === GridCellKind.Custom &&
      (cell as CustomCell<TransactionTypeCellData>).data?.type === "txn_type",
    draw: (args: DrawArgs<CustomCell<TransactionTypeCellData>>, cell) => {
      drawTextCell(
        args as Parameters<typeof drawTextCell>[0],
        transactionTypeLabel(cell.data.value)
      );
    },
    provideEditor: () => (p) => {
      const theme = p.theme;
      const data = p.value.data;
      const current = data.value;
      const inputStyle: React.CSSProperties = {
        height: 36,
        paddingTop: 6,
        paddingBottom: 6,
        paddingLeft: 8,
        border: `1px solid ${theme.borderColor ?? "#e2e8f0"}`,
        borderRadius: 6,
        fontSize: 14,
        fontFamily: "inherit",
        backgroundColor: theme.bgCell ?? "#fff",
        color: theme.textDark ?? "#171717",
        width: "100%",
        minWidth: 120,
        maxWidth: 220,
      };
      const isInternal = current === "INTERNAL_CREDIT";
      return (
        <select
          autoFocus
          value={current}
          style={inputStyle}
          className="focus:outline-none focus:border-[var(--muted)]"
          onChange={(e) => {
            const v = e.target.value as TransactionType;
            if (v === "INTERNAL_CREDIT" && data.canBeInternalSource) {
              onBeginInternalCreditPair?.(data.transactionId);
              p.onFinishedEditing({
                ...p.value,
                data: { ...data, value: "CREDIT" as const },
              });
              return;
            }
            const next = {
              ...p.value,
              data: { ...data, value: v },
            } satisfies CustomCell<TransactionTypeCellData>;
            p.onChange(next);
            p.onFinishedEditing(next);
          }}
        >
          {!isInternal && (
            <>
              <option value="DEBIT">Débit</option>
              <option value="CREDIT">Crédit</option>
            </>
          )}
          {isInternal && (
            <>
              <option value="CREDIT">Crédit</option>
              <option value="INTERNAL_CREDIT">Crédit interne</option>
            </>
          )}
          {data.canBeInternalSource && !isInternal && (
            <option value="INTERNAL_CREDIT">Crédit interne…</option>
          )}
        </select>
      );
    },
    getAccessibilityString: (cell: CustomCell<TransactionTypeCellData>) =>
      transactionTypeLabel(cell.data.value),
  } as CustomRenderer<CustomCell<TransactionTypeCellData>>;
}

/** Même géométrie / rendu que le pilule « Statut » (débit), couleurs type OK. */
interface InvoiceLinkCellData {
  type: "invoice_link";
  hasLink: boolean;
  /** Numéro de facture affiché dans la pilule (ex. FAC2025-0001). */
  invoiceLabel: string;
}

function truncateTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxInnerWidth: number
): string {
  if (ctx.measureText(text).width <= maxInnerWidth) return text;
  const ellipsis = "…";
  let s = text;
  while (s.length > 0 && ctx.measureText(s + ellipsis).width > maxInnerWidth) {
    s = s.slice(0, -1);
  }
  return s ? s + ellipsis : ellipsis;
}

function createInvoiceLinkRenderer(): CustomRenderer<CustomCell<InvoiceLinkCellData>> {
  const okPill = debitStatusPillStyle("ok");
  return {
    kind: GridCellKind.Custom,
    isMatch: (cell): cell is CustomCell<InvoiceLinkCellData> =>
      cell.kind === GridCellKind.Custom &&
      (cell as CustomCell<InvoiceLinkCellData>).data?.type === "invoice_link",
    draw: (args: DrawArgs<CustomCell<InvoiceLinkCellData>>, cell) => {
      const { ctx, rect, theme } = args;
      if (!cell.data.hasLink) {
        ctx.save();
        ctx.fillStyle = theme.textMedium ?? theme.textLight ?? "#94a3b8";
        ctx.font = `${theme.baseFontStyle} ${theme.fontFamily}`;
        ctx.textBaseline = "middle";
        ctx.fillText("—", rect.x + 8, rect.y + rect.height / 2);
        ctx.restore();
        return;
      }
      const pill = okPill ?? { label: "", bg: "#16a34a", fg: "#ffffff" };
      const padX = 8;
      const maxPillWidth = Math.max(24, rect.width - 12);
      ctx.save();
      ctx.font = `${theme.baseFontStyle} ${theme.fontFamily}`;
      const innerMax = maxPillWidth - padX * 2;
      const label = truncateTextToWidth(ctx, cell.data.invoiceLabel, innerMax);
      const w = Math.min(ctx.measureText(label).width + padX * 2, maxPillWidth);
      const h = Math.min(26, Math.max(20, rect.height - 10));
      const y = rect.y + (rect.height - h) / 2;
      const x = rect.x + 4;
      const r = Math.min(6, h / 2);
      roundedRect(ctx, x, y, w, h, r);
      ctx.fillStyle = pill.bg;
      ctx.fill();
      ctx.fillStyle = pill.fg;
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + padX, y + h / 2);
      ctx.restore();
    },
    getAccessibilityString: (cell: CustomCell<InvoiceLinkCellData>) =>
      cell.data.hasLink ? `Facture ${cell.data.invoiceLabel}` : "Pas de facture",
  } as CustomRenderer<CustomCell<InvoiceLinkCellData>>;
}

/** Pilule destructive, même géométrie que statut débit / facture. */
interface DeleteActionCellData {
  type: "delete_action";
}

/** Même pilule que la colonne Facture (hauteur, marges), couleurs destructives. */
const DELETE_ACTION_PILL = { label: "Supprimer", bg: "#dc2626", fg: "#ffffff" } as const;

function createDeleteActionRenderer(): CustomRenderer<CustomCell<DeleteActionCellData>> {
  return {
    kind: GridCellKind.Custom,
    isMatch: (cell): cell is CustomCell<DeleteActionCellData> =>
      cell.kind === GridCellKind.Custom &&
      (cell as CustomCell<DeleteActionCellData>).data?.type === "delete_action",
    draw: (args: DrawArgs<CustomCell<DeleteActionCellData>>) => {
      const { ctx, rect, theme } = args;
      const { label, bg, fg } = DELETE_ACTION_PILL;
      ctx.save();
      const padX = 8;
      const maxPillWidth = Math.max(24, rect.width - 12);
      ctx.font = `${theme.baseFontStyle} ${theme.fontFamily}`;
      const innerMax = maxPillWidth - padX * 2;
      const shortLabel = truncateTextToWidth(ctx, label, innerMax);
      const w = Math.min(ctx.measureText(shortLabel).width + padX * 2, maxPillWidth);
      const h = Math.min(26, Math.max(20, rect.height - 10));
      const y = rect.y + (rect.height - h) / 2;
      const x = rect.x + 4;
      const r = Math.min(6, h / 2);
      roundedRect(ctx, x, y, w, h, r);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textBaseline = "middle";
      ctx.fillText(shortLabel, x + padX, y + h / 2);
      ctx.restore();
    },
    getAccessibilityString: () => "Supprimer cette transaction",
  } as CustomRenderer<CustomCell<DeleteActionCellData>>;
}

const COL_FIELDS: (keyof Transaction | "rowNum" | "delete" | "invoice")[] = [
  "rowNum",
  "id",
  "transaction_date",
  "account_status_name",
  "bank_name",
  "company_name",
  "amount",
  "type",
  "description",
  "fournisseur_id",
  "client_account_type_id",
  "created_at",
  "processed_by_user_name",
  "debit_status",
  "invoice",
  "delete",
];

function formatAmount(value: string | undefined, type: TransactionType): string {
  if (value == null) return "";
  const num = Number(value);
  const signed = type === "DEBIT" ? -num : num;
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(signed);
}

export function TransactionsGrid({
  transactions,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  zoom = 100,
  onCellValueChanged,
  onSelectionStatsChange,
  onDelete,
  onSortDirect,
  onSortDefault,
  sortState,
  filterValues,
  onApplyFilters,
  bankAccounts = [],
  transactionsForFilterOptions = [],
  fournisseurs = [],
  settingsClients = [],
  onQuickCreateFournisseur,
  onQuickCreateSettingsClient,
  selectionResetNonce,
  onBeginInternalCreditPair,
}: TransactionsGridProps) {
  const scale = zoom / 100;
  const fournisseurRenderer = useMemo(
    () =>
      createFournisseurRenderer(fournisseurs, {
        onQuickCreate: onQuickCreateFournisseur,
      }),
    [fournisseurs, onQuickCreateFournisseur]
  );
  const settingsClientRenderer = useMemo(
    () =>
      createSettingsClientRenderer(settingsClients, {
        onQuickCreate: onQuickCreateSettingsClient,
      }),
    [settingsClients, onQuickCreateSettingsClient]
  );
  const debitStatusRenderer = useMemo(() => createDebitStatusRenderer(), []);
  const transactionTypeRenderer = useMemo(
    () => createTransactionTypeRenderer(onBeginInternalCreditPair),
    [onBeginInternalCreditPair]
  );
  const invoiceLinkRenderer = useMemo(() => createInvoiceLinkRenderer(), []);
  const deleteActionRenderer = useMemo(() => createDeleteActionRenderer(), []);
  const [selection, setSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [filterMenu, setFilterMenu] = useState<{
    columnId: string;
    anchor: FilterMenuAnchor;
  } | null>(null);

  const loadMoreThrottleRef = useRef(0);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const selectionResetNoncePrevRef = useRef<number | undefined>(undefined);

  const columnFiltersEnabled = Boolean(filterValues && onApplyFilters);
  const resolvedTheme = useResolvedTheme();

  const columns = useMemo<GridColumn[]>(() => {
    const filterActive = (id: string) =>
      columnFiltersEnabled && filterValues && columnHasActiveFilter(id, filterValues);
    /** Tri par défaut (date ↓) sur la colonne date = pas d’effet « tri actif » sur l’en-tête (évite confusion avec un filtre). */
    const sortActive = (id: string): boolean => {
      if (sortState == null || !SORTABLE_FIELDS.has(id) || sortState.column !== id) return false;
      if (
        isDefaultTransactionTableSort(sortState) &&
        id === DEFAULT_TRANSACTION_TABLE_SORT.column
      ) {
        return false;
      }
      return true;
    };

    /** Filtre actif, tri actif, ou les deux : en-tête distinct (couleur, puce, bord). */
    const columnHeaderThemeOverride = (id: string): Partial<Theme> | undefined => {
      const fa = filterActive(id);
      const sa = sortActive(id);
      if (!fa && !sa) return undefined;
      const accent = resolvedTheme.accentColor ?? LIGHT_THEME.accentColor ?? "#0d9488";
      const accentLight = resolvedTheme.accentLight ?? LIGHT_THEME.accentLight ?? "#ccfbf1";
      const bgCell = resolvedTheme.bgCell ?? LIGHT_THEME.bgCell ?? "#ffffff";
      const border = resolvedTheme.borderColor ?? LIGHT_THEME.borderColor ?? "#e2e8f0";
      if (fa) {
        return {
          textHeader: accent,
          headerFontStyle: glideHeaderFontStyle(scale, sa ? 750 : 700),
          bgCell: interpolateColors(bgCell, accentLight, sa ? 0.44 : 0.38),
          borderColor: interpolateColors(border, accent, sa ? 0.5 : 0.4),
        };
      }
      return {
        textHeader: accent,
        headerFontStyle: glideHeaderFontStyle(scale, 650),
        bgCell: interpolateColors(bgCell, accentLight, 0.26),
        borderColor: interpolateColors(border, accent, 0.34),
      };
    };

    const menuCol = (base: GridColumn & { id?: string }): GridColumn => {
      const id = base.id ?? "";
      const o = columnHeaderThemeOverride(id);
      const withMenu = columnFiltersEnabled && COLUMN_FILTER_IDS.has(id);
      return {
        ...base,
        ...(withMenu && { hasMenu: true }),
        ...(o !== undefined && { themeOverride: o }),
      };
    };

    const idHeader = columnHeaderThemeOverride("id");
    const createdAtHeader = columnHeaderThemeOverride("created_at");

    const cols: GridColumn[] = [
      { title: "#", width: Math.round(62 * scale), id: "rowNum" },
      {
        title: "ID Transaction",
        width: Math.round(124 * scale),
        id: "id",
        ...(idHeader !== undefined && { themeOverride: idHeader }),
      },
      menuCol({
        title: "Date",
        width: Math.round(130 * scale),
        id: "transaction_date",
      }),
      menuCol({
        title: "Statut du compte",
        width: Math.round(160 * scale),
        id: "account_status_name",
      }),
      menuCol({
        title: "Banque",
        width: Math.round(160 * scale),
        id: "bank_name",
      }),
      menuCol({
        title: "Société",
        width: Math.round(200 * scale),
        id: "company_name",
      }),
      menuCol({
        title: "Montant",
        width: Math.round(135 * scale),
        id: "amount",
      }),
      menuCol({ title: "Type", width: Math.round(80 * scale), id: "type" }),
      menuCol({
        title: "Description",
        width: 220,
        grow: 1,
        id: "description",
      }),
      {
        title: "Fournisseur",
        width: Math.round(180 * scale),
        id: "fournisseur",
      },
      menuCol({
        title: "Client",
        width: Math.round(200 * scale),
        id: "client_name",
      }),
      {
        title: "Créé le",
        width: Math.round(120 * scale),
        id: "created_at",
        ...(createdAtHeader !== undefined && { themeOverride: createdAtHeader }),
      },
      menuCol({
        title: "Ajouté par",
        width: Math.round(140 * scale),
        id: "processed_by_user_name",
      }),
      menuCol({
        title: "État",
        width: Math.round(168 * scale),
        id: "debit_status",
      }),
    ];
    cols.push({ title: "Facture", width: Math.round(118 * scale), id: "invoice" });
    if (onDelete) {
      cols.push({ title: "", width: Math.round(110 * scale), id: "delete" });
    }
    return cols;
  }, [
    scale,
    onDelete,
    columnFiltersEnabled,
    filterValues,
    sortState?.column,
    sortState?.direction,
    resolvedTheme.accentColor,
    resolvedTheme.accentLight,
    resolvedTheme.bgCell,
    resolvedTheme.borderColor,
  ]);

  const columnsRef = useRef(columns);
  useEffect(() => {
    columnsRef.current = columns;
  });

  const onHeaderMenuClickHandler = useCallback(
    (col: number, bounds: { x: number; y: number; width: number; height: number }) => {
      if (!columnFiltersEnabled) return;
      const columnId = columnsRef.current[col]?.id;
      if (!columnId || !COLUMN_FILTER_IDS.has(columnId)) return;
      setFilterMenu({ columnId, anchor: viewportHeaderBoundsToAnchor(bounds) });
    },
    [columnFiltersEnabled]
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const txn = transactions[row];
      if (!txn) {
        return { kind: GridCellKind.Loading, allowOverlay: false };
      }

      const field = COL_FIELDS[col];
      if (field === "rowNum") {
        return {
          kind: GridCellKind.Text,
          data: String(row + 1),
          displayData: String(row + 1),
          allowOverlay: false,
          readonly: true,
        };
      }
      if (field === "id") {
        const full = txn.id != null && String(txn.id) !== "" ? String(txn.id) : "";
        const val = full ? `${full.slice(0, 8)}…` : "";
        return {
          kind: GridCellKind.Text,
          data: val,
          displayData: val,
          copyData: full,
          allowOverlay: false,
          readonly: true,
        };
      }
      if (field === "transaction_date") {
        return {
          kind: GridCellKind.Custom,
          data: { type: "date", value: txn.transaction_date ?? "" },
          copyData: txn.transaction_date ?? "",
          allowOverlay: true,
        };
      }
      if (field === "account_status_name") {
        const emoji = (txn.account_status_emoji ?? "").trim();
        const name = txn.account_status_name ?? "";
        const val = [emoji, name].filter(Boolean).join(" ").trim();
        return {
          kind: GridCellKind.Text,
          data: val,
          displayData: val,
          allowOverlay: false,
          readonly: true,
        };
      }
      if (field === "bank_name") {
        const val = txn.bank_name ?? "";
        return {
          kind: GridCellKind.Text,
          data: val,
          displayData: val,
          allowOverlay: false,
          readonly: true,
        };
      }
      if (field === "company_name") {
        const val = txn.company_name ?? "";
        return {
          kind: GridCellKind.Text,
          data: val,
          displayData: val,
          allowOverlay: false,
          readonly: true,
        };
      }
      if (field === "amount") {
        const display = formatAmount(txn.amount, txn.type);
        const num = Number(txn.amount);
        const signed = txn.type === "DEBIT" ? -num : num;
        const isNegative = signed < 0;
        return {
          kind: GridCellKind.Number,
          data: txn.amount != null ? Number(txn.amount) : undefined,
          displayData: display,
          allowOverlay: true,
          allowNegative: true,
          fixedDecimals: 2,
          ...(isNegative && {
            themeOverride: { textDark: "#dc2626" },
          }),
        };
      }
      if (field === "type") {
        const value = (txn.type ?? "DEBIT") as TransactionType;
        return {
          kind: GridCellKind.Custom,
          data: {
            type: "txn_type" as const,
            value,
            transactionId: txn.id,
            canBeInternalSource: txn.type === "CREDIT",
          },
          copyData: transactionTypeLabel(value),
          allowOverlay: true,
        };
      }
      if (field === "debit_status") {
        if (txn.type !== "DEBIT") {
          return {
            kind: GridCellKind.Text,
            data: "",
            displayData: "",
            allowOverlay: false,
            readonly: true,
          };
        }
        const st = txn.debit_status;
        const value =
          st && (DEBIT_STATUS_VALUES as readonly string[]).includes(st) ? st : "";
        return {
          kind: GridCellKind.Custom,
          data: { type: "debit_status", value: value as "" | DebitTransactionStatus, editable: true },
          copyData: debitStatusLabel(st ?? null),
          allowOverlay: true,
          /** Glide « second-click » : sans override, l’overlay liste ne s’ouvre pas au double-clic fiable. */
          activationBehaviorOverride: "single-click",
          cursor: "pointer",
        };
      }
      if (field === "description") {
        return {
          kind: GridCellKind.Text,
          data: txn.description ?? "",
          displayData: txn.description ?? "",
          allowOverlay: true,
        };
      }
      if (field === "fournisseur_id") {
        return {
          kind: GridCellKind.Custom,
          data: { type: "fournisseur", id: txn.fournisseur_id ?? null },
          copyData: txn.fournisseur_name ?? "",
          allowOverlay: true,
        };
      }
      if (field === "client_account_type_id") {
        const defaultDisplayName = txn.bank_account_type_name ?? "";
        return {
          kind: GridCellKind.Custom,
          data: {
            type: "settings_client",
            overrideId: txn.client_account_type_id ?? null,
            displayName: txn.client_name ?? "",
            defaultDisplayName,
          },
          copyData: txn.client_name ?? "",
          allowOverlay: true,
        };
      }
      if (field === "created_at") {
        const val = txn.created_at
          ? new Date(txn.created_at).toLocaleString("fr-FR", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "";
        return {
          kind: GridCellKind.Text,
          data: val,
          displayData: val,
          allowOverlay: false,
          readonly: true,
        };
      }
      if (field === "processed_by_user_name") {
        const val = txn.processed_by_user_name ?? "";
        return {
          kind: GridCellKind.Text,
          data: val,
          displayData: val,
          allowOverlay: false,
          readonly: true,
        };
      }
      if (field === "invoice") {
        const hasInvoice = Boolean(txn.invoice_id ?? txn.invoice_pdf_url);
        const num = (txn.invoice_number ?? "").trim();
        const invoiceLabel = hasInvoice ? num || "Facture" : "";
        return {
          kind: GridCellKind.Custom,
          data: {
            type: "invoice_link" as const,
            hasLink: hasInvoice,
            invoiceLabel,
          },
          copyData: hasInvoice ? invoiceLabel : "",
          allowOverlay: false,
          readonly: true,
          cursor: hasInvoice ? "pointer" : "default",
        };
      }
      if (field === "delete") {
        return {
          kind: GridCellKind.Custom,
          data: { type: "delete_action" as const },
          copyData: DELETE_ACTION_PILL.label,
          allowOverlay: false,
          readonly: true,
          cursor: "pointer",
        };
      }
      return { kind: GridCellKind.Text, data: "", displayData: "", allowOverlay: false, readonly: true };
    },
    [transactions]
  );

  const onCellEdited = useCallback(
    async (cell: Item, newValue: EditableGridCell) => {
      const [col, row] = cell;
      const field = COL_FIELDS[col];
      const txn = transactions[row];
      if (!txn?.id || !onCellValueChanged) return;

      if (field === "invoice") {
        return;
      }
      if (field === "delete") {
        if (onDelete && confirm("Supprimer cette transaction ?")) {
          await onDelete(txn.id);
        }
        return;
      }

      if (
        field === "rowNum" ||
        field === "id" ||
        field === "account_status_name" ||
        field === "bank_name" ||
        field === "company_name" ||
        field === "created_at" ||
        field === "processed_by_user_name"
      )
        return;

      if (field === "fournisseur_id") {
        let v: unknown;
        if (newValue.kind === GridCellKind.Custom) {
          const d = (newValue as CustomCell<FournisseurCellData>).data;
          if (d?.type === "fournisseur") v = d.id ?? null;
        }
        if (v === undefined) return;
        try {
          await onCellValueChanged(txn.id, "fournisseur_id", v);
        } catch {
          // Page handles error display
        }
        return;
      }

      if (field === "client_account_type_id") {
        let v: unknown;
        if (newValue.kind === GridCellKind.Custom) {
          const d = (newValue as CustomCell<SettingsClientCellData>).data;
          if (d?.type === "settings_client") v = d.overrideId ?? null;
        }
        if (v === undefined) return;
        try {
          await onCellValueChanged(txn.id, "client_account_type_id", v);
        } catch {
          // Page handles error display
        }
        return;
      }

      if (field === "debit_status") {
        if (txn.type !== "DEBIT") return;
        let v: unknown;
        if (newValue.kind === GridCellKind.Custom) {
          const d = (newValue as CustomCell<DebitStatusCellData>).data;
          if (d?.type === "debit_status") v = d.value === "" ? null : d.value;
        }
        if (v === undefined) return;
        try {
          await onCellValueChanged(txn.id, "debit_status", v);
        } catch {
          // Page handles error display
        }
        return;
      }

      let value: unknown;
      if (field === "transaction_date") {
        if (newValue.kind === GridCellKind.Custom) {
          const data = (newValue as CustomCell<DateCellData>).data;
          value = data?.type === "date" ? data.value : undefined;
        }
        if (value === undefined) return;
      } else if (newValue.kind === GridCellKind.Number) {
        value = newValue.data;
      } else if (newValue.kind === GridCellKind.Custom && field === "type") {
        const d = (newValue as CustomCell<TransactionTypeCellData>).data;
        if (d?.type !== "txn_type") return;
        const nextType = d.value;
        if (nextType === "INTERNAL_CREDIT") return;
        try {
          await onCellValueChanged(txn.id, "type", nextType);
        } catch {
          // Page handles error display
        }
        return;
      } else if (newValue.kind === GridCellKind.Text) {
        value = newValue.data;
      } else {
        return;
      }

      try {
        await onCellValueChanged(txn.id, field, value);
      } catch {
        // Page handles error display
      }
    },
    [transactions, onCellValueChanged, onDelete]
  );

  const updateSelectionAndStats = useCallback(
    (newSelection: GridSelection) => {
      setSelection(newSelection);

      if (!onSelectionStatsChange) return;

      const checkedRows = newSelection.rows.toArray().sort((a, b) => a - b);
      const selectedTransactionIds = checkedRows
        .filter((r) => r >= 0 && r < transactions.length)
        .map((r) => transactions[r]?.id)
        .filter((id): id is string => Boolean(id));

      const current = newSelection.current;
      const hasRect = Boolean(current?.range);

      let sum = 0;
      let debitsTotal = 0;
      let creditsTotal = 0;
      let rowCount = 0;

      const addTxnTotals = (txn: (typeof transactions)[number]) => {
        const num = Number(txn.amount);
        if (Number.isNaN(num)) return;
        if (txn.type === "DEBIT") {
          debitsTotal += num;
          sum -= num;
        } else if (isCreditLikeType(txn.type)) {
          creditsTotal += num;
          sum += num;
        }
      };

      const accumulateFromColumnRects = (
        rects: readonly { x: number; y: number; width: number; height: number }[]
      ) => {
        const rowSet = new Set<number>();
        const numCols = COL_FIELDS.length;
        for (const rect of rects) {
          const { x, y, width, height } = rect;
          for (let row = y; row < y + height; row++) {
            if (row < 0 || row >= transactions.length) continue;
            const txn = transactions[row];
            if (!txn) continue;
            let rowTouchesAmount = false;
            for (let col = x; col < x + width; col++) {
              if (col < 0 || col >= numCols) continue;
              if (col === AMOUNT_COL) {
                rowTouchesAmount = true;
                break;
              }
            }
            if (rowTouchesAmount) {
              rowSet.add(row);
              addTxnTotals(txn);
            }
          }
        }
        rowCount = rowSet.size;
      };

      if (checkedRows.length > 0) {
        for (const row of checkedRows) {
          if (row < 0 || row >= transactions.length) continue;
          const txn = transactions[row];
          if (!txn) continue;
          rowCount += 1;
          addTxnTotals(txn);
        }
      } else if (hasRect && current?.range) {
        const ranges = [current.range, ...(current.rangeStack ?? [])];
        accumulateFromColumnRects(ranges);
      } else if (newSelection.columns.length > 0) {
        const ranges = newSelection.columns.toArray().map((x) => ({
          x,
          y: 0,
          width: 1,
          height: transactions.length,
        }));
        accumulateFromColumnRects(ranges);
      }

      if (checkedRows.length === 0 && !hasRect && newSelection.columns.length === 0) {
        onSelectionStatsChange(null);
        return;
      }

      onSelectionStatsChange({
        sum,
        rowCount,
        debitsTotal,
        creditsTotal,
        selectedTransactionIds,
      });
    },
    [transactions, onSelectionStatsChange]
  );

  const onGridSelectionChange = useCallback(
    (newSelection: GridSelection) => {
      updateSelectionAndStats(newSelection);
    },
    [updateSelectionAndStats]
  );

  useEffect(() => {
    if (selectionResetNonce === undefined) return;
    if (selectionResetNoncePrevRef.current === selectionResetNonce) return;
    const isInitial = selectionResetNoncePrevRef.current === undefined;
    selectionResetNoncePrevRef.current = selectionResetNonce;
    if (isInitial || !onSelectionStatsChange) return;
    const empty: GridSelection = {
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty(),
      current: undefined,
    };
    updateSelectionAndStats(empty);
  }, [selectionResetNonce, onSelectionStatsChange, updateSelectionAndStats]);

  /** Clic en dehors du tableau (comme Google Sheets) : réinitialiser la sélection. */
  useEffect(() => {
    if (!onSelectionStatsChange) return;
    const empty: GridSelection = {
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty(),
      current: undefined,
    };
    const onDocMouseDown = (e: MouseEvent) => {
      const root = gridContainerRef.current;
      if (!root) return;
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (root.contains(t)) return;
      const el = t instanceof Element ? t : null;
      if (el?.closest("#portal")) return;
      if (el?.closest('[role="dialog"]')) return;
      if (el?.closest("[data-keep-transaction-grid-selection]")) return;

      updateSelectionAndStats(empty);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [onSelectionStatsChange, updateSelectionAndStats]);

  /** Sélection type tableur : tout le corps de la colonne (rectangle), pas seulement l’en-tête. */
  const onHeaderClicked = useCallback(
    (colIndex: number, event: HeaderClickedEventArgs) => {
      if (!onSelectionStatsChange || event.button !== 0) return;
      const n = transactions.length;
      const next: GridSelection =
        n === 0
          ? {
              columns: CompactSelection.empty(),
              rows: CompactSelection.empty(),
              current: undefined,
            }
          : {
              columns: CompactSelection.empty(),
              rows: CompactSelection.empty(),
              current: {
                cell: [colIndex, 0],
                range: { x: colIndex, y: 0, width: 1, height: n },
                rangeStack: [],
              },
            };
      updateSelectionAndStats(next);
    },
    [transactions.length, onSelectionStatsChange, updateSelectionAndStats]
  );

  const onCellClicked = useCallback(
    async (cell: Item) => {
      const [col, row] = cell;
      const field = COL_FIELDS[col];
      const txn = transactions[row];
      if (field === "invoice" && txn) {
        if (txn.invoice_id) {
          window.open(`/api/invoices/${txn.invoice_id}/pdf`, "_blank");
        } else if (txn.invoice_pdf_url?.trim()) {
          window.open(new URL(txn.invoice_pdf_url.trim(), window.location.origin).href, "_blank");
        }
      } else if (field === "delete" && txn?.id && onDelete) {
        if (confirm("Supprimer cette transaction ?")) {
          try {
            await onDelete(txn.id);
          } catch {
            // Page handles error display
          }
        }
      }
    },
    [transactions, onDelete]
  );

  const rowHeight = Math.round(56 * scale);
  const headerHeight = Math.round(52 * scale);
  const gridTheme = useMemo(
    () => ({
      ...getDefaultTheme(),
      ...resolvedTheme,
      fontFamily: resolvedTheme.fontFamily ?? FONT_FAMILY_FALLBACK,
      headerFontStyle: glideHeaderFontStyle(scale),
    }),
    [resolvedTheme, scale]
  );

  const onItemHovered = useCallback((args: { location?: Item } | undefined) => {
    const loc = args?.location;
    const row = Array.isArray(loc) ? loc[1] : undefined;
    setHoveredRow(typeof row === "number" ? row : null);
  }, []);

  const getRowThemeOverride = useCallback(
    (row: number): Partial<Theme> | undefined => {
      if (hoveredRow === row && resolvedTheme.bgCellMedium) {
        return { bgCell: resolvedTheme.bgCellMedium };
      }
      return undefined;
    },
    [hoveredRow, resolvedTheme.bgCellMedium]
  );

  const handleVisibleRegionChanged = useCallback(
    (range: unknown) => {
      if (!onLoadMore || !hasMore || loadingMore || loading) return;
      const r = range as { y?: number; height?: number };
      if (typeof r.y !== "number" || typeof r.height !== "number") return;
      const totalRows = transactions.length;
      if (totalRows < 1) return;
      const visibleBottom = r.y + r.height;
      const threshold = Math.max(5, Math.ceil(totalRows * 0.05));
      if (visibleBottom < totalRows - threshold) return;
      const now = Date.now();
      if (now - loadMoreThrottleRef.current < 400) return;
      loadMoreThrottleRef.current = now;
      onLoadMore();
    },
    [onLoadMore, hasMore, loadingMore, loading, transactions.length]
  );

  const drawHeader = useCallback(
    (
      args: {
        ctx: CanvasRenderingContext2D;
        rect: { x: number; y: number; width: number; height: number };
        theme: Theme;
        hoverAmount: number;
        isSelected: boolean;
        column: GridColumn;
      },
      drawContent: () => void
    ) => {
      const { ctx, rect, theme, hoverAmount, isSelected, column } = args;
      if ("rowMarker" in column && column.rowMarker !== undefined) {
        drawContent();
        return;
      }
      const inset = Math.max(2, Math.round(3 * scale));
      const radius = Math.min(Math.round(8 * scale), Math.max(4, (rect.height - inset * 2) / 2));
      const bx = rect.x + inset;
      const by = rect.y + inset;
      const bw = rect.width - inset * 2;
      const bh = rect.height - inset * 2;
      if (bw < 8 || bh < 8) {
        drawContent();
        return;
      }
      const face = theme.bgCell ?? "#ffffff";
      const border = theme.borderColor ?? "#e2e8f0";
      ctx.save();
      roundedRect(ctx, bx, by, bw, bh, radius);
      ctx.fillStyle = isSelected ? interpolateColors(face, theme.accentColor, 0.22) : face;
      ctx.fill();
      ctx.strokeStyle = isSelected ? interpolateColors(border, theme.accentColor, 0.35) : border;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (hoverAmount > 0) {
        roundedRect(ctx, bx, by, bw, bh, radius);
        ctx.fillStyle = theme.bgHeaderHovered ?? theme.textMedium;
        ctx.globalAlpha = 0.14 * hoverAmount;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      drawContent();
    },
    [scale]
  );

  return (
    <div ref={gridContainerRef} className="flex min-h-0 w-full flex-1 flex-col">
      <div className="flex h-full min-h-[400px] w-full flex-col overflow-hidden rounded-md border border-[var(--border)]">
        {loading ? (
          <div className="flex h-full min-h-[400px] flex-1 items-center justify-center text-[var(--muted-foreground)]">
            Chargement des transactions…
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-hidden">
              <DataEditor
                width="100%"
                height="100%"
                columns={columns}
                rows={transactions.length}
                getCellContent={getCellContent}
                getCellsForSelection={true} /* requis pour Ctrl+C / copier la sélection (voir Glide DataEditor) */
                getRowThemeOverride={getRowThemeOverride}
                onItemHovered={onItemHovered}
                onCellEdited={onCellValueChanged ? onCellEdited : undefined}
                onCellClicked={onCellClicked}
                onHeaderClicked={onSelectionStatsChange ? onHeaderClicked : undefined}
                onHeaderMenuClick={columnFiltersEnabled ? onHeaderMenuClickHandler : undefined}
                gridSelection={onSelectionStatsChange ? selection : undefined}
                onGridSelectionChange={onSelectionStatsChange ? onGridSelectionChange : undefined}
                rangeSelect={onSelectionStatsChange ? "multi-rect" : "none"}
                rowSelectionMode={onSelectionStatsChange ? "multi" : undefined}
                rowMarkers="both"
                rowMarkerWidth={Math.round(52 * scale)}
                rowHeight={rowHeight}
                headerHeight={headerHeight}
                theme={gridTheme}
                drawHeader={drawHeader}
                onVisibleRegionChanged={onLoadMore && hasMore ? handleVisibleRegionChanged : undefined}
                customRenderers={[
                  dateCellRenderer,
                  fournisseurRenderer,
                  settingsClientRenderer,
                  debitStatusRenderer,
                  transactionTypeRenderer,
                  invoiceLinkRenderer,
                  deleteActionRenderer,
                ]}
              />
            </div>
            {loadingMore && (
              <div
                className="flex shrink-0 items-center justify-center gap-2 border-t border-[var(--border)] bg-[var(--muted)]/25 py-2.5 text-sm text-[var(--muted-foreground)]"
                role="status"
                aria-live="polite"
              >
                <span
                  className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden
                />
                Chargement des transactions suivantes…
              </div>
            )}
          </>
        )}
      </div>
      {filterMenu && filterValues && onApplyFilters && (
        <TransactionColumnFilterMenu
          columnId={filterMenu.columnId}
          anchor={filterMenu.anchor}
          sortable={SORTABLE_FIELDS.has(filterMenu.columnId)}
          sortState={sortState}
          applied={filterValues}
          transactionsForOptions={transactionsForFilterOptions}
          onClose={() => setFilterMenu(null)}
          onApply={onApplyFilters}
          onSortAsc={() => {
            if (SORTABLE_FIELDS.has(filterMenu.columnId)) {
              onSortDirect?.(filterMenu.columnId, "asc");
            }
            setFilterMenu(null);
          }}
          onSortDesc={() => {
            if (SORTABLE_FIELDS.has(filterMenu.columnId)) {
              onSortDirect?.(filterMenu.columnId, "desc");
            }
            setFilterMenu(null);
          }}
          onSortDefault={
            onSortDefault
              ? () => {
                  onSortDefault();
                  setFilterMenu(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
