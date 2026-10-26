"use client";

import { modalBackdropClose } from "@/lib/modal-backdrop-close";
import {
  EntityImportReportModal,
  type EntityImportReportSummary,
} from "@/components/EntityImportReportModal";

export type EntityImportUiState =
  | { phase: "progress"; fileNames: string[]; detail?: string }
  | { phase: "error"; message: string; fileNames?: string[] }
  | { phase: "report"; report: EntityImportReportSummary };

export function EntityImportUiModal({
  state,
  onClose,
}: {
  state: EntityImportUiState;
  onClose: () => void;
}) {
  if (state.phase === "report") {
    return <EntityImportReportModal report={state.report} onClose={onClose} />;
  }

  const title = state.phase === "progress" ? "Import en cours" : "Import impossible";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (state.phase === "error") modalBackdropClose(e, onClose);
      }}
    >
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="subsection-header text-lg font-medium text-[var(--foreground)]">{title}</h3>
        {state.phase === "progress" && (
          <>
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              {state.fileNames.length === 1
                ? `Fichier : ${state.fileNames[0]}`
                : `${state.fileNames.length} fichiers`}
            </p>
            {state.detail && (
              <p className="mt-2 text-sm text-[var(--foreground)]">{state.detail}</p>
            )}
            <div className="mt-4 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent"
                aria-hidden
              />
              Veuillez patienter…
            </div>
          </>
        )}
        {state.phase === "error" && (
          <>
            {state.fileNames && state.fileNames.length > 0 && (
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                {state.fileNames.join(", ")}
              </p>
            )}
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{state.message}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
            >
              Fermer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
