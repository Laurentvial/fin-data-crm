"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  DataEditor,
  GridCellKind,
  getDefaultTheme,
  drawTextCell,
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
import type { Transaction, TransactionType } from "@/lib/types";

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

function useResolvedTheme(): Partial<Theme> {
  const [theme, setTheme] = useState<Partial<Theme>>(LIGHT_THEME);
  useEffect(() => {
    const root = document.documentElement;
    const s = getComputedStyle(root);
    const get = (v: string) => s.getPropertyValue(v).trim();
    const prefersDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const base = prefersDark ? DARK_THEME : LIGHT_THEME;
    const resolved: Partial<Theme> = {
      ...base,
      accentColor: get("--primary") || base.accentColor,
      accentLight: get("--primary-muted") || base.accentLight,
      textDark: get("--foreground") || base.textDark,
      textMedium: get("--muted-foreground") || base.textMedium,
      textHeader: get("--muted-foreground") || base.textHeader,
      bgCell: get("--background") || base.bgCell,
      bgCellMedium: get("--muted") || base.bgCellMedium,
      bgHeader: get("--muted") || base.bgHeader,
      borderColor: get("--border") || base.borderColor,
    };
    setTheme(resolved);
  }, []);
  return theme;
}

const TRANSACTION_TYPES: TransactionType[] = ["DEBIT", "CREDIT"];
const AMOUNT_COL = 4; // Column index for amount (used for selection sum)

const SORTABLE_FIELDS = new Set<string>([
  "id",
  "transaction_date",
  "bank_account_name",
  "amount",
  "type",
  "description",
  "created_at",
]);

interface TransactionsGridProps {
  transactions: Transaction[];
  loading?: boolean;
  /** Zoom level in % (50–150). Scales row height and typography. */
  zoom?: number;
  onCellValueChanged?: (id: string, field: string, value: unknown) => Promise<void>;
  onSelectionSumChange?: (sum: number | null) => void;
  onDelete?: (id: string) => Promise<void>;
  /** Called when user clicks "Facture" to generate an invoice. */
  onGenerateInvoice?: (transaction: Transaction) => void;
  /** Called when user clicks a sortable column header. */
  onSortChange?: (field: string) => void;
  /** Current sort state for visual indicator. */
  sortState?: { column: string; direction: "asc" | "desc" };
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

const COL_FIELDS: (keyof Transaction | "rowNum" | "delete" | "invoice")[] = [
  "rowNum",
  "id",
  "transaction_date",
  "bank_account_name",
  "amount",
  "type",
  "description",
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
  zoom = 100,
  onCellValueChanged,
  onSelectionSumChange,
  onDelete,
  onGenerateInvoice,
  onSortChange,
  sortState,
}: TransactionsGridProps) {
  const scale = zoom / 100;
  const [selection, setSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const columns = useMemo<GridColumn[]>(() => {
    const sortIndicator = (id: string) => {
      if (!sortState || sortState.column !== id) return "";
      return sortState.direction === "asc" ? " ⬆" : " ⬇";
    };
    const cols: GridColumn[] = [
      { title: "#", width: Math.round(62 * scale), id: "rowNum" },
      { title: `ID Transaction${sortIndicator("id")}`, width: Math.round(100 * scale), id: "id" },
      { title: `Date${sortIndicator("transaction_date")}`, width: Math.round(130 * scale), id: "transaction_date" },
      { title: `Compte${sortIndicator("bank_account_name")}`, width: Math.round(280 * scale), id: "bank_account_name" },
      { title: `Montant${sortIndicator("amount")}`, width: Math.round(135 * scale), id: "amount" },
      { title: `Type${sortIndicator("type")}`, width: Math.round(80 * scale), id: "type" },
      { title: `Description${sortIndicator("description")}`, width: 220, grow: 1, id: "description" },
      { title: `Créé le${sortIndicator("created_at")}`, width: Math.round(120 * scale), id: "created_at" },
      { title: "Ajouté par", width: Math.round(140 * scale), id: "processed_by_user_name" },
    ];
    if (onGenerateInvoice) {
      cols.push({ title: "Facture", width: Math.round(155 * scale), id: "invoice" });
    }
    if (onDelete) {
      cols.push({ title: "", width: Math.round(110 * scale), id: "delete" });
    }
    return cols;
  }, [scale, onDelete, onGenerateInvoice, sortState]);

  const onHeaderClicked = useCallback(
    (colIndex: number) => {
      const field = columns[colIndex]?.id ?? COL_FIELDS[colIndex];
      if (!field || !SORTABLE_FIELDS.has(field) || !onSortChange) return;
      onSortChange(field);
    },
    [onSortChange, columns]
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
        const val = txn.id ? String(txn.id).slice(0, 8) + "…" : "";
        return {
          kind: GridCellKind.Text,
          data: val,
          displayData: val,
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
        const account = txn.bank_account_name ?? "";
        const company = txn.company_name ?? "";
        const val =
          account && company && account !== company
            ? `${account} – ${company}`
            : account || company || "";
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

      if (field === "rowNum" || field === "id" || field === "bank_account_name" || field === "created_at" || field === "processed_by_user_name") return;

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

      if (!onSelectionSumChange) return;

      const current = newSelection.current;
      if (!current?.range) {
        onSelectionSumChange(null);
        return;
      }

      const ranges = [current.range, ...(current.rangeStack ?? [])];
      let sum = 0;

      for (const rect of ranges) {
        const { x, y, width, height } = rect;
        for (let row = y; row < y + height; row++) {
          const txn = transactions[row];
          if (!txn) continue;
          for (let col = x; col < x + width; col++) {
            if (col === AMOUNT_COL) {
              const num = Number(txn.amount);
              if (!Number.isNaN(num)) {
                const signed = txn.type === "DEBIT" ? -num : num;
                sum += signed;
              }
              break;
            }
          }
        }
      }

      onSelectionSumChange(sum);
    },
    [transactions, onSelectionSumChange]
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
  const resolvedTheme = useResolvedTheme();
  const gridTheme = useMemo(
    () => ({ ...getDefaultTheme(), ...resolvedTheme }),
    [resolvedTheme]
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

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="h-full min-h-[400px] w-full overflow-hidden rounded-md border border-[var(--border)]">
        {loading ? (
          <div className="flex h-full min-h-[400px] items-center justify-center text-[var(--muted-foreground)]">
            Chargement des transactions…
          </div>
        ) : (
          <DataEditor
            width="100%"
            height="100%"
            columns={columns}
            rows={transactions.length}
            getCellContent={getCellContent}
            getRowThemeOverride={getRowThemeOverride}
            onItemHovered={onItemHovered}
            customRenderers={[dateCellRenderer]}
            onCellEdited={onCellValueChanged ? onCellEdited : undefined}
            onCellClicked={onDelete || onGenerateInvoice ? onCellClicked : undefined}
            onHeaderClicked={onSortChange ? onHeaderClicked : undefined}
            gridSelection={onSelectionSumChange ? selection : undefined}
            onGridSelectionChange={onSelectionSumChange ? onGridSelectionChange : undefined}
            rangeSelect={onSelectionSumChange ? "multi-rect" : "none"}
            rowMarkers="number"
            rowHeight={rowHeight}
            headerHeight={headerHeight}
            theme={gridTheme}
          />
        )}
      </div>
    </div>
  );
}
