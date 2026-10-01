"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  ENTITY_EXPORT_LIMIT,
  ENTITY_FORMAT_VERSION,
  ENTITY_KIND,
  type EntityTransferEntity,
} from "@/lib/entity-transfer-constants";

const IMPORT_BATCH_SIZE = 5;

type EntityTransferButtonsProps = {
  entity: EntityTransferEntity;
  ids: string[];
  labels: { singular: string; plural: string };
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

export function EntityTransferButtons({
  entity,
  ids,
  labels,
  onImported,
}: EntityTransferButtonsProps) {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setBusy("export");
    setError(null);
    setLastMessage(null);
    try {
      const res = await fetch("/api/entity-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, ids }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        const data = contentType.includes("application/json") ? await res.json() : null;
        throw new Error(responseError(data, "Échec de l'export"));
      }
      const payload = contentType.includes("application/json") ? await res.json() : null;
      if (!payload) throw new Error("Réponse d'export invalide.");
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bigboss-${entity}-${todayStamp()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      const exported = Array.isArray(payload.items) ? payload.items.length : 0;
      const requested =
        typeof payload.requested_count === "number" ? payload.requested_count : ids.length;
      const limitNote =
        requested > ENTITY_EXPORT_LIMIT
          ? ` ${exported} exportée(s) sur ${requested} affichée(s) — limite ${ENTITY_EXPORT_LIMIT}.`
          : "";
      setLastMessage(`Export ${labels.plural} téléchargé.${limitNote}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBusy(null);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    setBusy("import");
    setError(null);
    setLastMessage(null);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("Fichier JSON illisible.");
      }
      if (!payload || typeof payload !== "object") {
        throw new Error("Fichier d'import invalide.");
      }
      const parsed = payload as Record<string, unknown>;
      if (parsed.kind !== ENTITY_KIND) {
        throw new Error("Ce fichier n'est pas un export Sociétés / Comptes.");
      }
      if (parsed.entity !== entity) {
        throw new Error(
          `Ce fichier correspond à « ${String(parsed.entity ?? "inconnu")} », pas à ${labels.plural}.`
        );
      }

      const items = Array.isArray(parsed.items) ? parsed.items : [];
      const companies = Array.isArray(parsed.companies) ? parsed.companies : [];

      let inserted = 0;
      let skipped = 0;
      let companiesInserted = 0;
      let companiesSkipped = 0;

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
        return data as {
          inserted?: number;
          skipped?: number;
          companies_inserted?: number;
          companies_skipped?: number;
        };
      };

      if (entity === "bank_accounts" && companies.length > 0) {
        for (const batch of chunk(companies, IMPORT_BATCH_SIZE)) {
          const data = await postBatch({
            kind: ENTITY_KIND,
            format_version: ENTITY_FORMAT_VERSION,
            entity: "companies",
            items: batch,
          });
          companiesInserted += typeof data.inserted === "number" ? data.inserted : 0;
          companiesSkipped += typeof data.skipped === "number" ? data.skipped : 0;
        }
      }

      for (const batch of chunk(items, IMPORT_BATCH_SIZE)) {
        const data = await postBatch({
          kind: ENTITY_KIND,
          format_version: ENTITY_FORMAT_VERSION,
          entity,
          items: batch,
        });
        inserted += typeof data.inserted === "number" ? data.inserted : 0;
        skipped += typeof data.skipped === "number" ? data.skipped : 0;
        if (typeof data.companies_inserted === "number") {
          companiesInserted += data.companies_inserted;
        }
        if (typeof data.companies_skipped === "number") {
          companiesSkipped += data.companies_skipped;
        }
      }

      const companyNote =
        entity === "bank_accounts"
          ? ` Sociétés : ${companiesInserted} importée(s), ${companiesSkipped} ignorée(s).`
          : "";
      setLastMessage(
        `${labels.plural} : ${inserted} importé(s), ${skipped} ignoré(s) (déjà présents).${companyNote}`
      );
      await onImported();
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
    </div>
  );
}
