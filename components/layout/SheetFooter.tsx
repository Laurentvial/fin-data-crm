"use client";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface SheetFooterProps {
  totalCount: number;
  saveStatus?: SaveStatus;
  saveMessage?: string;
  /** Somme des cellules numériques sélectionnées (null si aucune sélection) */
  selectedSum?: number | null;
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function CloudIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
}

export function SheetFooter({ totalCount, saveStatus = "idle", saveMessage, selectedSum }: SheetFooterProps) {
  const statusText =
    saveStatus === "saving"
      ? "Enregistrement…"
      : saveStatus === "saved"
        ? "Toutes les modifications sont enregistrées"
        : saveStatus === "error"
          ? saveMessage ?? "Erreur d'enregistrement"
          : "Toutes les modifications sont enregistrées";

  return (
    <footer className="flex h-9 shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--background)] px-4 text-xs text-[var(--muted-foreground)]">
      <div className="flex items-center gap-3">
        <button type="button" className="rounded p-1 hover:bg-[var(--muted)]" aria-label="Menu">
          <MenuIcon className="h-4 w-4" />
        </button>
        <span>Total des transactions : {totalCount.toLocaleString("fr-FR")}</span>
        {selectedSum != null && (
          <span className="font-medium text-[var(--foreground)]">
            Somme sélectionnée :{" "}
            {new Intl.NumberFormat("fr-FR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(selectedSum)}{" "}
            €
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`flex items-center gap-1.5 ${
            saveStatus === "error" ? "text-red-600" : saveStatus === "saving" ? "text-amber-600" : ""
          }`}
        >
          <CloudIcon className="h-4 w-4" />
          {statusText}
        </span>
        <span className="flex items-center gap-1 rounded border border-[var(--border)] px-2 py-0.5">
          Zoom : 100 %
          <button type="button" className="opacity-50 hover:opacity-100" aria-label="Zoom arrière">
            −
          </button>
          <button type="button" className="opacity-50 hover:opacity-100" aria-label="Zoom avant">
            +
          </button>
        </span>
      </div>
    </footer>
  );
}
