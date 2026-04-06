"use client";

export interface InvoiceToolbarAction {
  count: number;
  disabled: boolean;
  disabledReason: string | null;
  onClick: () => void;
}

interface SheetToolbarProps {
  /** Remet à zéro tous les filtres du tableau (colonnes + période API). */
  onResetFiltersClick?: () => void;
  onExportClick?: () => void;
  onAddClick?: () => void;
  /** Import relevé PDF (extraction IA + revue des doublons). */
  onImportStatementClick?: () => void;
  /** Affiché à côté de « Ajouter » lorsqu’une seule ligne est cochée. */
  createInvoice?: InvoiceToolbarAction | null;
  /** Affiché à côté de « Ajouter » lorsque ≥ 2 lignes sont cochées. */
  groupedInvoice?: InvoiceToolbarAction | null;
  /** À côté de « Facture groupée » : suppression des lignes cochées (colonne cases). */
  bulkDeleteSelected?: { count: number; busy: boolean; onClick: () => void } | null;
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function UndoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}

function RedoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function FileUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="11" />
      <polyline points="9 14 12 11 15 14" />
    </svg>
  );
}

export function SheetToolbar({
  onResetFiltersClick,
  onExportClick,
  onAddClick,
  onImportStatementClick,
  createInvoice,
  groupedInvoice,
  bulkDeleteSelected,
}: SheetToolbarProps) {
  return (
    <div
      data-keep-transaction-grid-selection
      className="relative z-20 flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--header-bg)] px-4 shadow-sm"
    >
      {onAddClick && (
        <button
          type="button"
          onClick={onAddClick}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors shadow-sm"
        >
          <PlusIcon className="h-4 w-4" />
          Ajouter
        </button>
      )}
      {onImportStatementClick && (
        <button
          type="button"
          onClick={onImportStatementClick}
          title="Importer un relevé bancaire PDF (extraction automatique)"
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors shadow-sm"
        >
          <FileUpIcon className="h-4 w-4" />
          Importer relevé
        </button>
      )}
      {createInvoice && (
        <button
          type="button"
          disabled={createInvoice.disabled}
          title={createInvoice.disabled ? createInvoice.disabledReason ?? undefined : undefined}
          onClick={createInvoice.onClick}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Créer une facture
        </button>
      )}
      {groupedInvoice && (
        <button
          type="button"
          disabled={groupedInvoice.disabled}
          title={groupedInvoice.disabled ? groupedInvoice.disabledReason ?? undefined : undefined}
          onClick={groupedInvoice.onClick}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Facture groupée ({groupedInvoice.count})
        </button>
      )}
      {bulkDeleteSelected && bulkDeleteSelected.count > 0 ? (
        <button
          type="button"
          disabled={bulkDeleteSelected.busy}
          title="Supprimer les transactions cochées (colonne de gauche)"
          onClick={bulkDeleteSelected.onClick}
          className="flex items-center gap-2 rounded-lg border border-[var(--destructive)] bg-[var(--destructive)]/10 px-3 py-1.5 text-sm font-medium text-[var(--destructive)] hover:bg-[var(--destructive)]/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {bulkDeleteSelected.busy
            ? "Suppression…"
            : bulkDeleteSelected.count === 1
              ? "Supprimer la cochée"
              : `Supprimer (${bulkDeleteSelected.count})`}
        </button>
      ) : null}
      {onResetFiltersClick && (
        <button
          type="button"
          onClick={onResetFiltersClick}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <FilterIcon className="h-4 w-4" />
          Réinitialiser filtres
        </button>
      )}
      {onExportClick ? (
        <button
          type="button"
          onClick={onExportClick}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--success-muted)] hover:text-[var(--success)]"
        >
          <DownloadIcon className="h-4 w-4" />
          Exporter
        </button>
      ) : null}
      <div className="ml-2 h-6 w-px bg-[var(--border)]" />
      <button type="button" disabled className="rounded p-1.5 text-[var(--muted-foreground)] opacity-50" aria-label="Annuler">
        <UndoIcon className="h-4 w-4" />
      </button>
      <button type="button" disabled className="rounded p-1.5 text-[var(--muted-foreground)] opacity-50" aria-label="Rétablir">
        <RedoIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
