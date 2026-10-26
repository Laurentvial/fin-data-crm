"use client";

import { modalBackdropClose } from "@/lib/modal-backdrop-close";
import type {
  EntityImportSkipEntry,
  EntityImportSkipReason,
  EntityTransferEntity,
} from "@/lib/entity-transfer-constants";

export type EntityImportReportSummary = {
  entity: EntityTransferEntity;
  labels: { singular: string; plural: string };
  fileCount: number;
  inserted: number;
  skipped: number;
  skippedExisting: number;
  skippedMissingCompany: number;
  companiesInserted: number;
  companiesSkipped: number;
  companiesSkippedExisting: number;
  companiesSkippedInvalid: number;
  companySkips: EntityImportSkipEntry[];
  accountSkips: EntityImportSkipEntry[];
};

const REASON_LABEL: Record<EntityImportSkipReason, string> = {
  existing: "Déjà en base",
  invalid: "Données invalides",
  missing_company: "Société absente",
};

function SkipList({ title, entries }: { title: string; entries: EntityImportSkipEntry[] }) {
  if (entries.length === 0) return null;
  const byReason: Record<EntityImportSkipReason, EntityImportSkipEntry[]> = {
    existing: [],
    invalid: [],
    missing_company: [],
  };
  for (const e of entries) {
    byReason[e.reason].push(e);
  }
  return (
    <div className="mt-4">
      <h4 className="mb-2 text-sm font-medium text-[var(--foreground)]">{title}</h4>
      <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
        {(["existing", "invalid", "missing_company"] as const).map((reason) => {
          const list = byReason[reason];
          if (list.length === 0) return null;
          return (
            <div key={reason}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                {REASON_LABEL[reason]} ({list.length})
              </p>
              <ul className="space-y-1.5">
                {list.map((entry, i) => (
                  <li key={`${reason}-${entry.id ?? i}`} className="text-[var(--foreground)]">
                    <span className="font-medium">{entry.name ?? entry.id ?? "—"}</span>
                    {entry.name && entry.id && (
                      <span className="ml-1 text-xs text-[var(--muted-foreground)]">
                        ({entry.id.slice(0, 8)}…)
                      </span>
                    )}
                    {entry.detail && (
                      <p className="text-xs leading-snug text-[var(--muted-foreground)]">{entry.detail}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EntityImportReportModal({
  report,
  onClose,
}: {
  report: EntityImportReportSummary;
  onClose: () => void;
}) {
  const {
    entity,
    labels,
    fileCount,
    inserted,
    skipped,
    skippedExisting,
    skippedMissingCompany,
    companiesInserted,
    companiesSkipped,
    companiesSkippedExisting,
    companiesSkippedInvalid,
    companySkips,
    accountSkips,
  } = report;

  const otherAccountSkipped = Math.max(0, skipped - skippedExisting - skippedMissingCompany);
  const companiesSkippedOther = Math.max(
    0,
    companiesSkipped - companiesSkippedExisting - companiesSkippedInvalid
  );

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => modalBackdropClose(e, onClose)}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--border)] p-5">
          <h3 className="subsection-header text-lg font-medium text-[var(--foreground)]">
            Rapport d&apos;import
          </h3>
          {fileCount > 1 && (
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {fileCount} fichiers traités (ordre alphabétique).
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-[var(--muted-foreground)]">{labels.plural} importés</dt>
            <dd className="tabular-nums font-medium text-[var(--foreground)]">{inserted}</dd>
            {skippedExisting > 0 && (
              <>
                <dt className="text-[var(--muted-foreground)]">{labels.plural} déjà présents</dt>
                <dd className="tabular-nums font-medium text-[var(--foreground)]">{skippedExisting}</dd>
              </>
            )}
            {skippedMissingCompany > 0 && (
              <>
                <dt className="text-[var(--muted-foreground)]">{labels.plural} sans société</dt>
                <dd className="tabular-nums font-medium text-[var(--destructive)]">
                  {skippedMissingCompany}
                </dd>
              </>
            )}
            {otherAccountSkipped > 0 && entity === "bank_accounts" && (
              <>
                <dt className="text-[var(--muted-foreground)]">{labels.plural} invalides</dt>
                <dd className="tabular-nums font-medium text-[var(--foreground)]">
                  {otherAccountSkipped}
                </dd>
              </>
            )}
            {entity === "bank_accounts" && (
              <>
                <dt className="text-[var(--muted-foreground)]">Sociétés importées</dt>
                <dd className="tabular-nums font-medium text-[var(--foreground)]">
                  {companiesInserted}
                </dd>
                {companiesSkippedExisting > 0 && (
                  <>
                    <dt className="text-[var(--muted-foreground)]">Sociétés déjà présentes</dt>
                    <dd className="tabular-nums font-medium text-[var(--foreground)]">
                      {companiesSkippedExisting}
                    </dd>
                  </>
                )}
                {companiesSkippedInvalid > 0 && (
                  <>
                    <dt className="text-[var(--muted-foreground)]">Sociétés invalides</dt>
                    <dd className="tabular-nums font-medium text-[var(--foreground)]">
                      {companiesSkippedInvalid}
                    </dd>
                  </>
                )}
                {companiesSkippedOther > 0 && (
                  <>
                    <dt className="text-[var(--muted-foreground)]">Sociétés autres ignorées</dt>
                    <dd className="tabular-nums font-medium text-[var(--foreground)]">
                      {companiesSkippedOther}
                    </dd>
                  </>
                )}
              </>
            )}
          </dl>

          {entity === "bank_accounts" &&
            companiesSkippedExisting > 0 &&
            skippedMissingCompany === 0 && (
              <p className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
                Une société « ignorée » peut signifier qu&apos;elle était{" "}
                <strong className="font-medium text-[var(--foreground)]">déjà sur la cible</strong>{" "}
                : elle n&apos;est pas recréée, mais les comptes qui y sont rattachés peuvent
                quand même être importés.
              </p>
            )}

          <SkipList title="Sociétés ignorées (détail)" entries={companySkips} />
          {entity === "bank_accounts" && (
            <SkipList title="Comptes ignorés (détail)" entries={accountSkips} />
          )}
          {entity === "companies" && companySkips.length === 0 && skipped === 0 && (
            <p className="mt-4 text-sm text-[var(--muted-foreground)]">
              Toutes les sociétés du fichier ont été importées.
            </p>
          )}
          {entity === "bank_accounts" &&
            companySkips.length === 0 &&
            accountSkips.length === 0 &&
            skipped === 0 &&
            companiesSkipped === 0 && (
              <p className="mt-4 text-sm text-[var(--muted-foreground)]">
                Aucun élément ignoré.
              </p>
            )}
        </div>

        <div className="border-t border-[var(--border)] p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
