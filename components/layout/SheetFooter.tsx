"use client";

import { useSidebar } from "@/lib/SidebarContext";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const ZOOM_MIN = 50;
const ZOOM_MAX = 150;
const ZOOM_STEP = 10;

interface SheetFooterProps {
  totalCount: number;
  saveStatus?: SaveStatus;
  saveMessage?: string;
  /** Somme des cellules numériques sélectionnées (null si aucune sélection) */
  selectedSum?: number | null;
  /** Solde total (somme des montants, débits négatifs) */
  totalBalance?: number | null;
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

export function SheetFooter({ totalCount, saveStatus = "idle", saveMessage, selectedSum, totalBalance, zoom = 100, onZoomIn, onZoomOut }: SheetFooterProps) {
  const sidebar = useSidebar();
  const statusText =
    saveStatus === "saving"
      ? "Enregistrement…"
      : saveStatus === "saved"
        ? "Toutes les modifications sont enregistrées"
        : saveStatus === "error"
          ? saveMessage ?? "Erreur d'enregistrement"
          : "Toutes les modifications sont enregistrées";

  return (
    <footer className="flex h-9 shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--header-bg)] px-4 text-xs text-[var(--muted-foreground)]">
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={sidebar?.toggleSidebar}
          className="rounded p-1 hover:bg-[var(--muted)]"
          aria-label={sidebar?.sidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}
        >
          <MenuIcon className="h-4 w-4" />
        </button>
        <span>Total des transactions : {totalCount.toLocaleString("fr-FR")}</span>
        {selectedSum != null && (
          <span className="shrink-0 font-medium text-[var(--foreground)] whitespace-nowrap">
            Somme sélectionnée :{" "}
            {new Intl.NumberFormat("fr-FR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(selectedSum)}{" "}
            €
          </span>
        )}
        {totalBalance != null && (
          <span className="shrink-0 font-medium text-[var(--foreground)] whitespace-nowrap">
            Solde total :{" "}
            {new Intl.NumberFormat("fr-FR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(totalBalance)}{" "}
            €
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`flex items-center gap-1.5 ${
            saveStatus === "error" ? "text-[var(--destructive)]" : saveStatus === "saving" ? "text-[var(--warning)]" : saveStatus === "saved" ? "text-[var(--success)]" : ""
          }`}
        >
          <CloudIcon className="h-4 w-4" />
          {statusText}
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
