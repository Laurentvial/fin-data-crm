"use client";

import { useSidebar } from "@/lib/SidebarContext";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const ZOOM_MIN = 50;
const ZOOM_MAX = 150;
const ZOOM_STEP = 10;

interface SheetFooterProps {
  saveStatus?: SaveStatus;
  saveMessage?: string;
  /** Nombre de transactions visibles dans le tableau (filtres appliqués). */
  visibleTransactionCount?: number;
  /** Libellé du décompte de lignes lié à la sélection (cochées ou plage avec montant). */
  selectionRowsLabel?: string;
  /** Nombre de lignes comptées pour la sélection active. */
  selectionRowsCount?: number;
  /** Niveau de zoom en % (50-150) */
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
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

export function SheetFooter({
  saveStatus = "idle",
  saveMessage,
  visibleTransactionCount,
  selectionRowsLabel,
  selectionRowsCount,
  zoom = 100,
  onZoomIn,
  onZoomOut,
}: SheetFooterProps) {
  const sidebar = useSidebar();
  const statusText =
    saveStatus === "saving"
      ? "Enregistrement…"
      : saveStatus === "saved"
        ? "Enregistré"
        : saveStatus === "error"
          ? saveMessage ?? "Erreur d'enregistrement"
          : "Enregistré";

  const statusTextLong =
    saveStatus === "saving"
      ? "Enregistrement…"
      : saveStatus === "saved"
        ? "Toutes les modifications sont enregistrées"
        : saveStatus === "error"
          ? saveMessage ?? "Erreur d'enregistrement"
          : "Toutes les modifications sont enregistrées";

  return (
    <footer className="relative z-10 flex min-h-12 shrink-0 flex-col gap-2 border-t border-[var(--border)] bg-[var(--header-bg)] px-3 py-2 text-xs text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-0">
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={sidebar?.toggleSidebar}
          className="rounded p-1 hover:bg-[var(--muted)]"
          aria-label={sidebar?.sidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}
        >
          <MenuIcon className="h-4 w-4" />
        </button>
        {visibleTransactionCount !== undefined ? (
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums text-[var(--foreground)]">
            <span>
              Transactions affichées{" "}
              <span className="font-medium">{visibleTransactionCount.toLocaleString("fr-FR")}</span>
            </span>
            {selectionRowsLabel !== undefined && selectionRowsCount !== undefined ? (
              <>
                <span className="text-[var(--muted-foreground)]" aria-hidden>
                  ·
                </span>
                <span>
                  {selectionRowsLabel}{" "}
                  <span className="font-medium">{selectionRowsCount.toLocaleString("fr-FR")}</span>
                </span>
              </>
            ) : null}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-2">
        <span
          className={`flex items-center gap-1.5 ${
            saveStatus === "error" ? "text-[var(--destructive)]" : saveStatus === "saving" ? "text-[var(--warning)]" : saveStatus === "saved" ? "text-[var(--success)]" : ""
          }`}
        >
          <CloudIcon className="h-4 w-4 shrink-0" />
          <span className="sm:hidden">{statusText}</span>
          <span className="hidden sm:inline">{statusTextLong}</span>
        </span>
        <span className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5">
          Zoom : {zoom} %
          <button
            type="button"
            onClick={onZoomOut}
            disabled={!onZoomOut || zoom <= ZOOM_MIN}
            className="rounded px-1 text-[var(--primary)] hover:bg-[var(--primary-muted)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            aria-label="Zoom arrière"
          >
            −
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            disabled={!onZoomIn || zoom >= ZOOM_MAX}
            className="rounded px-1 text-[var(--primary)] hover:bg-[var(--primary-muted)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            aria-label="Zoom avant"
          >
            +
          </button>
        </span>
      </div>
    </footer>
  );
}
