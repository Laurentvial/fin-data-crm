"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  DataEditor,
  GridCellKind,
  getDefaultTheme,
  type GridColumn,
  type GridCell,
  type Item,
  type GridSelection,
  type EditableGridCell,
  CompactSelection,
  type Theme,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import type { Transaction, TransactionType } from "@/lib/types";

const LIGHT_THEME: Partial<Theme> = {
  accentColor: "#2563eb",
  accentLight: "#eff6ff",
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
  accentColor: "#3b82f6",
  accentLight: "#1e3a5f",
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

interface TransactionsGridProps {
  transactions: Transaction[];
  loading?: boolean;
  /** Zoom level in % (50–150). Scales row height and typography. */
  zoom?: number;
  onCellValueChanged?: (id: string, field: string, value: unknown) => Promise<void>;
  onSelectionSumChange?: (sum: number | null) => void;
  onDelete?: (id: string) => Promise<void>;
}

const COL_FIELDS: (keyof Transaction | "rowNum" | "delete")[] = [
  "rowNum",
  "id",
  "transaction_date",
  "bank_account_name",
  "amount",
  "type",
  "description",
  "created_at",
  "delete",
];

function formatAmount(value: string | undefined, type: TransactionType): string {
  if (value == null) return "";
  const num = Number(value);
  const signed = type === "DEBIT" ? -Math.abs(num) : num;
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
}: TransactionsGridProps) {
  const scale = zoom / 100;
  const [selection, setSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });

  const columns = useMemo<GridColumn[]>(() => {
    const cols: GridColumn[] = [
      { title: "#", width: Math.round(56 * scale), id: "rowNum" },
      { title: "ID Transaction", width: Math.round(140 * scale), id: "id" },
      { title: "Date", width: Math.round(120 * scale), id: "transaction_date" },
      { title: "Compte", width: Math.round(180 * scale), id: "bank_account_name" },
      { title: "Montant", width: Math.round(120 * scale), id: "amount" },
      { title: "Type", width: Math.round(120 * scale), id: "type" },
      { title: "Description", width: 200, grow: 1, id: "description" },
      { title: "Créé le", width: Math.round(160 * scale), id: "created_at" },
    ];
    if (onDelete) {
      cols.push({ title: "", width: Math.round(100 * scale), id: "delete" });
    }
    return cols;
  }, [scale, onDelete]);

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
        const val = txn.transaction_date
          ? new Date(txn.transaction_date).toLocaleDateString("fr-FR", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })
          : "";
        return {
          kind: GridCellKind.Text,
          data: txn.transaction_date ?? "",
          displayData: val,
          allowOverlay: true,
        };
      }
      if (field === "bank_account_name") {
        const val = txn.bank_account_name ?? txn.company_name ?? "";
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
        return {
          kind: GridCellKind.Number,
          data: txn.amount != null ? Number(txn.amount) : undefined,
          displayData: display,
          allowOverlay: true,
          allowNegative: true,
          fixedDecimals: 2,
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

      if (field === "delete") {
        if (onDelete && confirm("Supprimer cette transaction ?")) {
          await onDelete(txn.id);
        }
        return;
      }

      if (field === "rowNum" || field === "id" || field === "bank_account_name" || field === "created_at") return;

      let value: unknown;
      if (newValue.kind === GridCellKind.Number) {
        value = newValue.data;
      } else if (newValue.kind === GridCellKind.Text) {
        if (field === "transaction_date") {
          value = newValue.data;
        } else if (field === "type") {
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
    [transactions, onCellValueChanged, onDelete]
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
                const signed = txn.type === "DEBIT" ? -Math.abs(num) : num;
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
      if (field === "delete" && txn?.id && onDelete) {
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
  const resolvedTheme = useResolvedTheme();
  const gridTheme = useMemo(
    () => ({ ...getDefaultTheme(), ...resolvedTheme }),
    [resolvedTheme]
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
            onCellEdited={onCellValueChanged ? onCellEdited : undefined}
            onCellClicked={onDelete ? onCellClicked : undefined}
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
