"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import {
  EntityImportReportModal,
  type EntityImportReportSummary,
} from "@/components/EntityImportReportModal";
import {
  ENTITY_EXPORT_LIMIT,
  ENTITY_FORMAT_VERSION,
  ENTITY_KIND,
  type EntityImportSkipEntry,
  type EntityTransferEntity,
} from "@/lib/entity-transfer-constants";

const IMPORT_BATCH_SIZE = 5;

type EntityTransferButtonsProps = {
  entity: EntityTransferEntity;
  ids: string[];
  labels: { singular: string; plural: string };
  /** Suffixe lisible (ex. nom de statut) pour le nom de fichier d’export. */
  exportFilenameSuffix?: string;
  onImported: () => void | Promise<void>;
};

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function responseError(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === "string" && err.trim()) return err;
  }
  return fallback;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

type ImportBatchResult = {
  inserted?: number;
  skipped?: number;
  skipped_existing?: number;
  skipped_missing_company?: number;
  companies_inserted?: number;
  companies_skipped?: number;
  companies_skipped_existing?: number;
  companies_skipped_invalid?: number;
  skip_details?: {
    companies?: EntityImportSkipEntry[];
    accounts?: EntityImportSkipEntry[];
  };
};

export function EntityTransferButtons({
  entity,
  ids,
  labels,
  exportFilenameSuffix,
  onImported,
}: EntityTransferButtonsProps) {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<EntityImportReportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadExportPayload = (
    payload: unknown,
    disposition: string,
    fallbackName: string
  ) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const match = /filename="([^"]+)"/.exec(disposition);
    a.download = match?.[1] ?? fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExport = async () => {
    setBusy("export");
    setError(null);
    setLastMessage(null);
    try {
      const batches = chunk(ids, ENTITY_EXPORT_LIMIT);
      const totalParts = batches.length;
      let exportedTotal = 0;

      for (let partIndex = 0; partIndex < batches.length; partIndex += 1) {
        const batchIds = batches[partIndex]!;
        const partLabel =
          totalParts > 1 ? `-part-${partIndex + 1}-sur-${totalParts}` : "";
        const suffixBase = exportFilenameSuffix?.trim() ?? "";
        const filenameSuffix = suffixBase
          ? `${suffixBase}${partLabel}`
          : partLabel.replace(/^-/, "") || undefined;

        const res = await fetch("/api/entity-export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity,
            ids: batchIds,
            ...(filenameSuffix ? { filename_suffix: filenameSuffix } : {}),
          }),
        });
        const contentType = res.headers.get("content-type") ?? "";
        if (!res.ok) {
          const data = contentType.includes("application/json") ? await res.json() : null;
          throw new Error(responseError(data, "Échec de l'export"));
        }
        const payload = contentType.includes("application/json") ? await res.json() : null;
        if (!payload) throw new Error("Réponse d'export invalide.");

        const exported = Array.isArray(payload.items) ? payload.items.length : 0;
        exportedTotal += exported;
        const disposition = res.headers.get("content-disposition") ?? "";
        const fallbackName =
          totalParts > 1
            ? `bigboss-${entity}${partLabel}-${todayStamp()}.json`
            : `bigboss-${entity}-${todayStamp()}.json`;
        downloadExportPayload(payload, disposition, fallbackName);

        if (partIndex < batches.length - 1) {
          await new Promise((r) => setTimeout(r, 350));
        }
      }

      if (totalParts > 1) {
        setLastMessage(
          `${totalParts} fichiers téléchargés — ${exportedTotal} ${labels.plural} sur ${ids.length} affiché(s) (${ENTITY_EXPORT_LIMIT} max par fichier, ordre de la liste).`
        );
      } else {
        setLastMessage(`Export ${labels.plural} téléchargé (${exportedTotal}).`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBusy(null);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    event.target.value = "";
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).sort((a, b) => a.name.localeCompare(b.name, "fr"));

    setBusy("import");
    setError(null);
    setLastMessage(null);
    setImportReport(null);
    try {
      let inserted = 0;
      let skipped = 0;
      let skippedExisting = 0;
      let skippedMissingCompany = 0;
      let companiesInserted = 0;
      let companiesSkipped = 0;
      let companiesSkippedExisting = 0;
      let companiesSkippedInvalid = 0;
      const companySkips: EntityImportSkipEntry[] = [];
      const accountSkips: EntityImportSkipEntry[] = [];

      const postBatch = async (body: Record<string, unknown>) => {
        const res = await fetch("/api/entity-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(responseError(data, "Échec de l'import"));
        }
        return data as ImportBatchResult;
      };

      const accumulate = (data: ImportBatchResult) => {
        inserted += typeof data.inserted === "number" ? data.inserted : 0;
        skipped += typeof data.skipped === "number" ? data.skipped : 0;
        skippedExisting += typeof data.skipped_existing === "number" ? data.skipped_existing : 0;
        skippedMissingCompany +=
          typeof data.skipped_missing_company === "number" ? data.skipped_missing_company : 0;
        if (typeof data.companies_inserted === "number") {
          companiesInserted += data.companies_inserted;
        }
        if (typeof data.companies_skipped === "number") {
          companiesSkipped += data.companies_skipped;
        }
        if (typeof data.companies_skipped_existing === "number") {
          companiesSkippedExisting += data.companies_skipped_existing;
        }
        companiesSkippedInvalid +=
          typeof data.companies_skipped_invalid === "number" ? data.companies_skipped_invalid : 0;
        if (data.skip_details?.companies?.length) {
          companySkips.push(...data.skip_details.companies);
        }
        if (data.skip_details?.accounts?.length) {
          accountSkips.push(...data.skip_details.accounts);
        }
      };

      for (const file of files) {
        const text = await file.text();
        let payload: unknown;
        try {
          payload = JSON.parse(text);
        } catch {
          throw new Error(`Fichier JSON illisible : ${file.name}`);
        }
        if (!payload || typeof payload !== "object") {
          throw new Error(`Fichier d'import invalide : ${file.name}`);
        }
        const parsed = payload as Record<string, unknown>;
        if (parsed.kind !== ENTITY_KIND) {
          throw new Error(`Ce fichier n'est pas un export Sociétés / Comptes : ${file.name}`);
        }
        if (parsed.entity !== entity) {
          throw new Error(
            `« ${file.name} » correspond à « ${String(parsed.entity ?? "inconnu")} », pas à ${labels.plural}.`
          );
        }

        const items = Array.isArray(parsed.items) ? parsed.items : [];
        const companies = Array.isArray(parsed.companies) ? parsed.companies : [];

        if (entity === "bank_accounts" && companies.length > 0) {
          for (const batch of chunk(companies, IMPORT_BATCH_SIZE)) {
            accumulate(
              await postBatch({
                kind: ENTITY_KIND,
                format_version: ENTITY_FORMAT_VERSION,
                entity: "companies",
                items: batch,
              })
            );
          }
        }

        for (const batch of chunk(items, IMPORT_BATCH_SIZE)) {
          accumulate(
            await postBatch({
              kind: ENTITY_KIND,
              format_version: ENTITY_FORMAT_VERSION,
              entity,
              items: batch,
            })
          );
        }
      }

      setImportReport({
        entity,
        labels,
        fileCount: files.length,
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
      });
      setLastMessage(
        `Import terminé — ${inserted} ${labels.plural} importé(s)` +
          (skippedExisting > 0 ? `, ${skippedExisting} déjà en base` : "") +
          (entity === "bank_accounts" && companiesInserted > 0
            ? ` · ${companiesInserted} société(s) importée(s)`
            : "") +
          ". Voir le rapport."
      );
      void onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={busy != null || ids.length === 0}
          className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
        >
          {busy === "export" ? "Export…" : "Exporter"}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy != null}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
        >
          {busy === "import" ? "Import…" : "Importer"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          multiple
          className="hidden"
          onChange={(e) => void handleFileChange(e)}
        />
      </div>
      {error && (
        <p className="max-w-sm text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {lastMessage && (
        <p className="max-w-sm text-xs text-[var(--muted-foreground)]">{lastMessage}</p>
      )}
      {importReport &&
        typeof document !== "undefined" &&
        createPortal(
          <EntityImportReportModal
            report={importReport}
            onClose={() => setImportReport(null)}
          />,
          document.body
        )}
    </div>
  );
}
