"use client";

import type { TransactionSelectionStats } from "@/components/TransactionsGrid";

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function StatBlock({
  label,
  value,
  valueClassName,
  size = "lg",
  hideLabel = false,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  size?: "lg" | "md";
  hideLabel?: boolean;
}) {
  const valueCls =
    size === "lg"
      ? "text-xl font-semibold tabular-nums tracking-tight leading-tight break-words sm:text-2xl lg:text-3xl xl:text-4xl"
      : "text-lg font-semibold tabular-nums tracking-tight leading-tight break-words sm:text-xl lg:text-2xl";
  return (
    <div className="min-w-0">
      {!hideLabel && (
        <p className="mb-1 text-sm font-medium text-[var(--muted-foreground)]">{label}</p>
      )}
      <p className={`${valueCls} ${valueClassName ?? "text-[var(--foreground)]"}`}>{value}</p>
    </div>
  );
}

interface TransactionsSummaryPanelProps {
  /** Somme nette (débits négatifs, crédits positifs) : jour courant si aucun filtre, sinon toutes les lignes visibles. */
  summaryNetTotal: number;
  summaryDebitsTotal: number;
  summaryCreditsTotal: number;
  /** Totaux sur l'ensemble des lignes filtrées, y compris celles non affichées dans la grille. */
  allFilteredSummaryNetTotal: number;
  allFilteredSummaryDebitsTotal: number;
  allFilteredSummaryCreditsTotal: number;
  allFilteredSummaryCount: number;
  /** Si true, les totaux portent sur toutes les lignes filtrées (plus de vue « uniquement aujourd’hui »). */
  filtersNarrowingView: boolean;
  selectionStats: TransactionSelectionStats | null;
}

const summaryRowClass =
  "flex flex-wrap items-baseline gap-x-8 gap-y-6 sm:gap-x-10 lg:gap-x-12";
const alignedTotalsGridClass =
  "grid min-w-0 grid-cols-1 gap-y-3 sm:grid-cols-2 sm:gap-x-6 xl:grid-cols-3 xl:gap-x-10";

/** Indicateurs d’un bloc sur une ligne (wrap si besoin). À partir de `md`, vue actuelle et sélection sont côte à côte. */
export function TransactionsSummaryPanel({
  summaryNetTotal,
  summaryDebitsTotal,
  summaryCreditsTotal,
  allFilteredSummaryNetTotal,
  allFilteredSummaryDebitsTotal,
  allFilteredSummaryCreditsTotal,
  allFilteredSummaryCount,
  filtersNarrowingView,
  selectionStats,
}: TransactionsSummaryPanelProps) {
  return (
    <section
      data-keep-transaction-grid-selection
      className="relative z-30 min-w-0 shrink-0 border-b border-[var(--primary-muted-border)] bg-[var(--card)] px-3 py-4 shadow-[0_6px_20px_rgba(13,148,136,0.08)] sm:px-4 md:py-3"
      aria-label={
        filtersNarrowingView
          ? "Totaux sur les lignes filtrées et sélection"
          : "Totaux à la date du jour et sélection"
      }
    >
      <div
        className={
          selectionStats !== null
            ? "flex min-h-0 min-w-0 flex-col gap-6 md:flex-row md:items-stretch md:gap-8 lg:gap-10"
            : "flex min-h-0 min-w-0 items-stretch md:items-center"
        }
      >
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col justify-center ${
            filtersNarrowingView
              ? "rounded-r-lg border-l-[3px] border-l-[var(--primary)] pl-3"
              : ""
          }`}
        >
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            {filtersNarrowingView ? (
              <>Totaux — lignes affichées</>
            ) : (
              <>Aujourd&apos;hui</>
            )}
          </p>
          {!filtersNarrowingView && (
            <p className="mb-3 text-[11px] font-normal normal-case tracking-normal text-[var(--muted-foreground)]">
              Vue par défaut : uniquement les transactions à la date du jour parmi le tableau chargé. Aucun filtre actif.
            </p>
          )}
          <div className={filtersNarrowingView ? alignedTotalsGridClass : summaryRowClass}>
            <StatBlock
              label={filtersNarrowingView ? "Total net" : "Total aujourd'hui"}
              value={`${formatEur(summaryNetTotal)} €`}
              valueClassName="text-[var(--primary)]"
            />
            <StatBlock
              label={filtersNarrowingView ? "Total des débits" : "Total des débits aujourd'hui"}
              value={`-${formatEur(summaryDebitsTotal)} €`}
              valueClassName="text-[var(--destructive)]"
            />
            <StatBlock
              label={filtersNarrowingView ? "Total des crédits" : "Total des crédits aujourd'hui"}
              value={`${formatEur(summaryCreditsTotal)} €`}
              valueClassName="text-[var(--success)]"
            />
          </div>
          {filtersNarrowingView && (
            <div className="mt-2">
              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                Toutes les lignes filtrées ({allFilteredSummaryCount})
              </p>
              <div className={alignedTotalsGridClass}>
                <StatBlock
                  label="Net (toutes lignes)"
                  value={`${formatEur(allFilteredSummaryNetTotal)} €`}
                  valueClassName="text-[var(--primary)]"
                  size="md"
                  hideLabel
                />
                <StatBlock
                  label="Débits (toutes lignes)"
                  value={`-${formatEur(allFilteredSummaryDebitsTotal)} €`}
                  valueClassName="text-[var(--destructive)]"
                  size="md"
                  hideLabel
                />
                <StatBlock
                  label="Crédits (toutes lignes)"
                  value={`${formatEur(allFilteredSummaryCreditsTotal)} €`}
                  valueClassName="text-[var(--success)]"
                  size="md"
                  hideLabel
                />
              </div>
            </div>
          )}
        </div>

        {selectionStats !== null && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center border-t border-[var(--border)] pt-5 md:border-t-0 md:border-l md:pl-8 md:pt-0 lg:pl-10">
            <p className="mb-3 shrink-0 text-sm font-medium text-[var(--muted-foreground)]">Sélection dans le tableau</p>
            <div className={`${summaryRowClass} shrink-0`}>
              <StatBlock
                label="Somme des montants (net)"
                value={`${formatEur(selectionStats.sum)} €`}
                valueClassName="text-[var(--primary)]"
              />
              <StatBlock
                label="Débits sélectionnés"
                value={`${formatEur(selectionStats.debitsTotal)} €`}
                valueClassName="text-[var(--destructive)]"
              />
              <StatBlock
                label="Crédits sélectionnés"
                value={`${formatEur(selectionStats.creditsTotal)} €`}
                valueClassName="text-[var(--success)]"
              />
            </div>
            <p className="mt-3 max-w-xl shrink-0 text-xs leading-relaxed text-[var(--muted-foreground)]">
              {selectionStats.selectedTransactionIds.length > 0 ? (
                <>
                  Cochez les cases à gauche : une ligne → « Créer une facture » dans la barre d&apos;outils ; plusieurs
                  lignes → « Facture groupée » ou « Supprimer ». Les totaux ci-dessus portent sur les lignes cochées.
                  Débits et crédits : sommes brutes (positives) par type.
                </>
              ) : (
                <>
                  Sans cases cochées, le décompte ne concerne que les rangées dont la cellule « Montant » est incluse dans
                  la sélection rectangulaire. Débits et crédits : sommes brutes (positives) par type.
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
