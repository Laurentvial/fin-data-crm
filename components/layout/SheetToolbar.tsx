"use client";

interface SheetToolbarProps {
  onFilterClick?: () => void;
  onExportClick?: () => void;
  onAddClick?: () => void;
  filterPanelOpen?: boolean;
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function SortIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="9" y2="18" />
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

export function SheetToolbar({ onFilterClick, onExportClick, onAddClick, filterPanelOpen }: SheetToolbarProps) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--background)] px-4">
      {onAddClick && (
        <button
          type="button"
          onClick={onAddClick}
          className="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90"
        >
          <PlusIcon className="h-4 w-4" />
          Ajouter
        </button>
      )}
      <button
        type="button"
        onClick={onFilterClick}
        className={
          filterPanelOpen
            ? "flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium bg-[var(--primary-muted)] text-[var(--primary)]"
            : "flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        }
      >
        <FilterIcon className="h-4 w-4" />
        Filtre
      </button>
      <button
        type="button"
        className="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <SortIcon className="h-4 w-4" />
        Trier
      </button>
      <button
        type="button"
        onClick={onExportClick}
        className="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
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
