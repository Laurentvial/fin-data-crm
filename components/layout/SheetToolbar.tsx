"use client";

interface SheetToolbarProps {
  /** Remet à zéro tous les filtres du tableau (colonnes + période API). */
  onResetFiltersClick?: () => void;
  onExportClick?: () => void;
  onAddClick?: () => void;
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

export function SheetToolbar({ onResetFiltersClick, onExportClick, onAddClick }: SheetToolbarProps) {
  return (
    <div className="relative z-20 flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--header-bg)] px-4 shadow-sm">
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
      <button
        type="button"
        onClick={onExportClick}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--success-muted)] hover:text-[var(--success)]"
      >
        <DownloadIcon className="h-4 w-4" />
        Exporter
      </button>
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
