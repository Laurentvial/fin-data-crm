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
}: {
  label: string;
  value: string;
  valueClassName?: string;
  size?: "lg" | "md";
}) {
  const valueCls =
    size === "lg"
      ? "text-4xl font-semibold tabular-nums tracking-tight"
      : "text-3xl font-semibold tabular-nums tracking-tight";
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-[var(--muted-foreground)]">{label}</p>
      <p className={`${valueCls} ${valueClassName ?? "text-[var(--foreground)]"}`}>{value}</p>
    </div>
  );
}

interface TransactionsSummaryPanelProps {
  visibleCount: number;
  visibleBalance: number;
  visibleDebitsTotal: number;
  visibleCreditsTotal: number;
  selectionStats: TransactionSelectionStats | null;
}

const summaryRowClass =
  "flex flex-wrap items-baseline gap-x-8 gap-y-6 sm:gap-x-10 lg:gap-x-12";

/** Tous les indicateurs de la vue (puis de la sélection) sur une même ligne, avec retour à la ligne si besoin. */
export function TransactionsSummaryPanel({
  visibleCount,
  visibleBalance,
  visibleDebitsTotal,
  visibleCreditsTotal,
  selectionStats,
}: TransactionsSummaryPanelProps) {
  return (
    <section
      className="relative z-30 shrink-0 border-b border-[var(--primary-muted-border)] bg-[var(--card)] px-4 py-5 shadow-[0_6px_20px_rgba(13,148,136,0.08)]"
      aria-label="Transactions affichées et totaux"
    >
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        Vue actuelle (filtres appliqués)
      </p>
      <div className={summaryRowClass}>
        <StatBlock label="Transactions affichées" value={visibleCount.toLocaleString("fr-FR")} />
        <StatBlock
          label="Solde total"
          value={`${formatEur(visibleBalance)} €`}
          valueClassName="text-[var(--primary)]"
        />
        <StatBlock
          label="Total des débits"
          value={`${formatEur(visibleDebitsTotal)} €`}
          valueClassName="text-[var(--destructive)]"
        />
        <StatBlock
          label="Total des crédits"
          value={`${formatEur(visibleCreditsTotal)} €`}
          valueClassName="text-[var(--success)]"
        />
      </div>

      {selectionStats !== null && (
        <div className="mt-6 border-t border-[var(--border)] pt-5">
          <p className="mb-3 text-sm font-medium text-[var(--muted-foreground)]">Sélection dans le tableau</p>
          <div className={summaryRowClass}>
            <StatBlock
              label="Lignes avec montant dans la sélection"
              value={selectionStats.rowCount.toLocaleString("fr-FR")}
            />
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
          <p className="mt-3 max-w-xl text-xs leading-relaxed text-[var(--muted-foreground)]">
            Le décompte de lignes et les totaux ne concernent que les rangées dont la cellule « Montant » est incluse
            dans la sélection. Débits et crédits : sommes brutes (positives) par type.
          </p>
        </div>
      )}
    </section>
  );
}
