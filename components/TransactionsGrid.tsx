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
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import type { BankAccount, Fournisseur, Transaction, TransactionType } from "@/lib/types";
import { TransactionColumnFilterMenu, type FilterMenuAnchor } from "@/components/TransactionColumnFilterMenu";
import {
  DEFAULT_TRANSACTION_TABLE_SORT,
  isDefaultTransactionTableSort,
} from "@/lib/transaction-sort";
import {
  columnHasActiveFilter,
  type TransactionFilterValues,
} from "@/lib/transaction-filters";

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

const AMOUNT_COL = 5; // Column index for amount (used for selection sum)

const SORTABLE_FIELDS = new Set<string>([
  "id",
  "transaction_date",
  "bank_account_name",
  "company_name",
  "amount",
  "type",
  "description",
  "created_at",
  "processed_by_user_name",
]);

const COLUMN_FILTER_IDS = new Set<string>([
  "transaction_date",
  "bank_account_name",
  "company_name",
  "amount",
  "type",
  "description",
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
  /** Called when user clicks "Facture" to generate an invoice. */
  onGenerateInvoice?: (transaction: Transaction) => void;
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

function createFournisseurRenderer(
  fournisseurs: Fournisseur[]
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
    provideEditor: () => (p) => {
      const theme = p.theme;
      const currentId = p.value.data.id ?? "";
      const inputStyle: React.CSSProperties = {
        height: 36,
        padding: "6px 8px",
        border: `1px solid ${theme.borderColor ?? "#e2e8f0"}`,
        borderRadius: 6,
        fontSize: 14,
        fontFamily: "inherit",
        background: theme.bgCell ?? "#fff",
        color: theme.textDark ?? "#171717",
        width: "100%",
        minWidth: 160,
        maxWidth: 360,
      };
      return (
        <select
          autoFocus
          value={currentId}
          style={inputStyle}
          className="focus:outline-none focus:border-[var(--muted)]"
          onChange={(e) => {
            const v = e.target.value;
            const nextId = v === "" ? null : v;
            const next = { ...p.value, data: { type: "fournisseur" as const, id: nextId } };
            p.onChange(next);
            p.onFinishedEditing(next);
          }}
        >
          <option value="">—</option>
          {fournisseurs.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      );
    },
    getAccessibilityString: (cell: CustomCell<FournisseurCellData>) => {
      const fid = cell.data.id;
      return fid ? fournisseurs.find((f) => f.id === fid)?.name ?? "" : "";
    },
  } as CustomRenderer<CustomCell<FournisseurCellData>>;
}

const COL_FIELDS: (keyof Transaction | "rowNum" | "delete" | "invoice")[] = [
  "rowNum",
  "id",
  "transaction_date",
  "bank_account_name",
  "company_name",
  "amount",
  "type",
  "description",
  "fournisseur_id",
  "created_at",
  "processed_by_user_name",
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

function formatType(value: string | undefined): string {
  return value === "CREDIT" ? "Crédit" : "Débit";
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
  onGenerateInvoice,
  onSortDirect,
  onSortDefault,
  sortState,
  filterValues,
  onApplyFilters,
  bankAccounts = [],
  transactionsForFilterOptions = [],
  fournisseurs = [],
}: TransactionsGridProps) {
  const scale = zoom / 100;
  const fournisseurRenderer = useMemo(
    () => createFournisseurRenderer(fournisseurs),
    [fournisseurs]
  );
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
        title: "Compte",
        width: Math.round(200 * scale),
        id: "bank_account_name",
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
    ];
    if (onGenerateInvoice) {
      cols.push({ title: "Facture", width: Math.round(155 * scale), id: "invoice" });
    }
    if (onDelete) {
      cols.push({ title: "", width: Math.round(110 * scale), id: "delete" });
    }
    return cols;
  }, [
    scale,
    onDelete,
    onGenerateInvoice,
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
      if (field === "bank_account_name") {
        const val = txn.bank_account_name ?? "";
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
        const display = formatType(txn.type);
        return {
          kind: GridCellKind.Text,
          data: txn.type ?? "",
          displayData: display,
          allowOverlay: true,
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
        const label = hasInvoice ? "Voir la facture" : "Créer une facture";
        return {
          kind: GridCellKind.Text,
          data: label,
          displayData: label,
          allowOverlay: false,
          readonly: true,
          themeOverride: {
            bgCell: hasInvoice ? "#22c55e" : "#ffffff",
            textDark: hasInvoice ? "#ffffff" : "#1a1a1a",
          },
        };
      }
      if (field === "delete") {
        return {
          kind: GridCellKind.Text,
          data: "Supprimer",
          displayData: "Supprimer",
          allowOverlay: false,
          readonly: true,
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
        if (onGenerateInvoice) {
          onGenerateInvoice(txn);
        }
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
        field === "bank_account_name" ||
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

      let value: unknown;
      if (field === "transaction_date") {
        if (newValue.kind === GridCellKind.Custom) {
          const data = (newValue as CustomCell<DateCellData>).data;
          value = data?.type === "date" ? data.value : undefined;
        }
        if (value === undefined) return;
      } else if (newValue.kind === GridCellKind.Number) {
        value = newValue.data;
      } else if (newValue.kind === GridCellKind.Text) {
        if (field === "type") {
          const raw = (newValue.data as string).toUpperCase();
          value = raw === "DEBIT" || raw === "DÉBIT" ? "DEBIT" : raw === "CREDIT" || raw === "CRÉDIT" ? "CREDIT" : raw;
        } else {
          value = newValue.data;
        }
      } else {
        return;
      }

      try {
        await onCellValueChanged(txn.id, field, value);
      } catch {
        // Page handles error display
      }
    },
    [transactions, onCellValueChanged, onDelete, onGenerateInvoice]
  );

  const onGridSelectionChange = useCallback(
    (newSelection: GridSelection) => {
      setSelection(newSelection);

      if (!onSelectionStatsChange) return;

      const current = newSelection.current;
      if (!current?.range) {
        onSelectionStatsChange(null);
        return;
      }

      const ranges = [current.range, ...(current.rangeStack ?? [])];
      let sum = 0;
      let debitsTotal = 0;
      let creditsTotal = 0;
      const rowSet = new Set<number>();

      for (const rect of ranges) {
        const { x, y, width, height } = rect;
        for (let row = y; row < y + height; row++) {
          if (row < 0 || row >= transactions.length) continue;
          const txn = transactions[row];
          if (!txn) continue;
          for (let col = x; col < x + width; col++) {
            if (col === AMOUNT_COL) {
              rowSet.add(row);
              const num = Number(txn.amount);
              if (!Number.isNaN(num)) {
                if (txn.type === "DEBIT") {
                  debitsTotal += num;
                  sum -= num;
                } else {
                  creditsTotal += num;
                  sum += num;
                }
              }
              break;
            }
          }
        }
      }

      onSelectionStatsChange({ sum, rowCount: rowSet.size, debitsTotal, creditsTotal });
    },
    [transactions, onSelectionStatsChange]
  );

  const onCellClicked = useCallback(
    async (cell: Item) => {
      const [col, row] = cell;
      const field = COL_FIELDS[col];
      const txn = transactions[row];
      if (field === "invoice" && txn && onGenerateInvoice) {
        const hasInvoice = Boolean(txn.invoice_id ?? txn.invoice_pdf_url);
        if (hasInvoice && txn.invoice_id) {
          window.open(`/api/invoices/${txn.invoice_id}/pdf`, "_blank");
        } else {
          onGenerateInvoice(txn);
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
    [transactions, onDelete, onGenerateInvoice]
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
    <div className="flex min-h-0 w-full flex-1 flex-col">
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
                onCellClicked={onDelete || onGenerateInvoice ? onCellClicked : undefined}
                onHeaderMenuClick={columnFiltersEnabled ? onHeaderMenuClickHandler : undefined}
                gridSelection={onSelectionStatsChange ? selection : undefined}
                onGridSelectionChange={onSelectionStatsChange ? onGridSelectionChange : undefined}
                rangeSelect={onSelectionStatsChange ? "multi-rect" : "none"}
                rowMarkers="number"
                rowHeight={rowHeight}
                headerHeight={headerHeight}
                theme={gridTheme}
                drawHeader={drawHeader}
                onVisibleRegionChanged={onLoadMore && hasMore ? handleVisibleRegionChanged : undefined}
                customRenderers={[dateCellRenderer, fournisseurRenderer]}
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
          bankAccounts={bankAccounts}
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
