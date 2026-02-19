"use client";

import { useCallback, useMemo, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { CellSelectionModule } from "ag-grid-enterprise";
import type { ColDef, CellValueChangedEvent, CellSelectionChangedEvent, ICellRendererParams } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "@/app/ag-grid-theme.css";
import type { Transaction, TransactionType } from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule, CellSelectionModule]);

/** Colonnes contenant des valeurs numériques à sommer */
const NUMERIC_FIELDS = new Set(["amount"]);

interface TransactionsGridProps {
  transactions: Transaction[];
  loading?: boolean;
  onCellValueChanged?: (id: string, field: string, value: unknown) => Promise<void>;
  onSelectionSumChange?: (sum: number | null) => void;
}

const TRANSACTION_TYPES: TransactionType[] = ["DEBIT", "CREDIT"];

function TypeBadgeCell(params: ICellRendererParams<Transaction>) {
  const value = params.value as string | undefined;
  if (value == null) return null;
  const isCredit = value === "CREDIT";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        isCredit
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
      }`}
    >
      {isCredit ? "Crédit" : "Débit"}
    </span>
  );
}

export function TransactionsGrid({
  transactions,
  loading = false,
  onCellValueChanged,
  onSelectionSumChange,
}: TransactionsGridProps) {
  const gridRef = useRef<AgGridReact>(null);

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 80,
    }),
    []
  );

  const columnDefs = useMemo<ColDef[]>(
    () => [
      {
        headerName: "#",
        width: 56,
        maxWidth: 56,
        sortable: false,
        filter: false,
        valueGetter: (params) => (params.node?.rowIndex ?? 0) + 1,
      },
      {
        field: "id",
        headerName: "ID Transaction",
        editable: false,
        width: 140,
        valueFormatter: (params) => (params.value ? String(params.value).slice(0, 8) + "…" : ""),
      },
      {
        field: "transaction_date",
        headerName: "Date",
        editable: true,
        width: 120,
        valueFormatter: (params) =>
          params.value
            ? new Date(params.value).toLocaleDateString("fr-FR", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              })
            : "",
      },
      {
        field: "company_name",
        headerName: "Société",
        editable: false,
        width: 180,
      },
      {
        field: "amount",
        headerName: "Montant",
        editable: true,
        width: 120,
        valueFormatter: (params) =>
          params.value != null
            ? new Intl.NumberFormat("fr-FR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(Number(params.value))
            : "",
      },
      {
        field: "type",
        headerName: "Type",
        editable: true,
        width: 120,
        cellRenderer: TypeBadgeCell,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: TRANSACTION_TYPES },
      },
      {
        field: "description",
        headerName: "Description",
        editable: true,
        flex: 1,
        minWidth: 200,
      },
      {
        field: "created_at",
        headerName: "Créé le",
        editable: false,
        width: 160,
        valueFormatter: (params) =>
          params.value
            ? new Date(params.value).toLocaleString("fr-FR", {
                dateStyle: "short",
                timeStyle: "short",
              })
            : "",
      },
    ],
    []
  );

  const onCellValueChangedHandler = useCallback(
    async (event: CellValueChangedEvent) => {
      if (!event.data?.id || event.colDef?.field == null || event.newValue === event.oldValue) return;
      if (!onCellValueChanged) return;
      const field = event.colDef.field;
      try {
        await onCellValueChanged(event.data.id, field, event.newValue);
      } catch {
        // Page handles save status and error display in footer
      }
    },
    [onCellValueChanged]
  );

  const onCellSelectionChangedHandler = useCallback(
    (event: CellSelectionChangedEvent<Transaction>) => {
      if (!onSelectionSumChange || !event.finished) return;
      const api = event.api;
      const ranges = api?.getCellRanges?.();
      if (!ranges || ranges.length === 0) {
        onSelectionSumChange(null);
        return;
      }
      let sum = 0;
      for (const range of ranges) {
        if (!range.columns || !range.startRow || !range.endRow) continue;
        const startIdx = Math.min(range.startRow.rowIndex, range.endRow.rowIndex);
        const endIdx = Math.max(range.startRow.rowIndex, range.endRow.rowIndex);
        for (let rowIdx = startIdx; rowIdx <= endIdx; rowIdx++) {
          const rowNode = api.getDisplayedRowAtIndex(rowIdx);
          if (!rowNode?.data) continue;
          for (const col of range.columns) {
            const colId = typeof col === "string" ? col : col.getColId();
            if (NUMERIC_FIELDS.has(colId)) {
              const val = rowNode.data[colId as keyof Transaction];
              const num = Number(val);
              if (!Number.isNaN(num)) sum += num;
            }
          }
        }
      }
      onSelectionSumChange(sum);
    },
    [onSelectionSumChange]
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="ag-theme-findata h-full min-h-[400px] w-full">
        <AgGridReact
          ref={gridRef}
          rowData={transactions}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onCellValueChanged={onCellValueChanged ? onCellValueChangedHandler : undefined}
          onCellSelectionChanged={onSelectionSumChange ? onCellSelectionChangedHandler : undefined}
          cellSelection={!!onSelectionSumChange}
          suppressMovableColumns={false}
          animateRows
          getRowId={(params) => params.data.id}
          loading={loading}
          overlayLoadingTemplate="Chargement des transactions…"
          theme="legacy"
        />
      </div>
    </div>
  );
}
