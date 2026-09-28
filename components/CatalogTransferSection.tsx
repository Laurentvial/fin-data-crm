"use client";

import { useRef, useState, type ChangeEvent } from "react";

type CatalogEntity = "templates" | "clients" | "sources" | "banks";

const CATALOG_ROWS: Array<{
  entity: CatalogEntity;
  label: string;
  hint: string;
}> = [
  {
    entity: "templates",
    label: "Templates de facture",
    hint: "Modèles HTML globaux (hors sociétés).",
  },
  {
    entity: "clients",
    label: "Clients",
    hint: "Types de comptes (nom, emoji, ordre).",
  },
  {
    entity: "sources",
    label: "Sources",
    hint: "Catalogue des sources.",
  },
  {
    entity: "banks",
    label: "Banques",
    hint: "Banques et logos.",
  },
];

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

export function CatalogTransferSection() {
  const [busyEntity, setBusyEntity] = useState<CatalogEntity | null>(null);
  const [busyAction, setBusyAction] = useState<"export" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingEntityRef = useRef<CatalogEntity | null>(null);

  const handleExport = async (entity: CatalogEntity) => {
    setBusyEntity(entity);
    setBusyAction("export");
    setError(null);
    setLastMessage(null);
    try {
      const res = await fetch(`/api/admin/catalog-export?entity=${encodeURIComponent(entity)}`);
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        const data = contentType.includes("application/json") ? await res.json() : null;
        throw new Error(responseError(data, "Échec de l'export"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bigboss-${entity}-${todayStamp()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setLastMessage(`Export ${labelFor(entity)} téléchargé.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBusyEntity(null);
      setBusyAction(null);
    }
  };

  const openImportPicker = (entity: CatalogEntity) => {
    pendingEntityRef.current = entity;
    setError(null);
    setLastMessage(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    const expectedEntity = pendingEntityRef.current;
    pendingEntityRef.current = null;
    if (!file || !expectedEntity) return;

    setBusyEntity(expectedEntity);
    setBusyAction("import");
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
      const entityFromFile =
        payload && typeof payload === "object" && "entity" in payload
          ? (payload as { entity?: unknown }).entity
          : null;
      if (entityFromFile !== expectedEntity) {
        throw new Error(
          `Ce fichier correspond à « ${String(entityFromFile ?? "inconnu")} », pas à ${labelFor(expectedEntity).toLowerCase()}.`
        );
      }

      const res = await fetch("/api/admin/catalog-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(responseError(data, "Échec de l'import"));
      }
      const inserted = typeof data.inserted === "number" ? data.inserted : 0;
      const skipped = typeof data.skipped === "number" ? data.skipped : 0;
      setLastMessage(
        `${labelFor(expectedEntity)} : ${inserted} importé(s), ${skipped} ignoré(s) (déjà présents).`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBusyEntity(null);
      setBusyAction(null);
    }
  };

  return (
    <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="section-header mb-4 text-lg font-medium">Export / Import</h2>
      <p className="mb-4 text-sm text-[var(--muted-foreground)]">
        Exportez un catalogue en JSON, puis importez-le en un clic sur un autre déploiement.
        Les éléments déjà présents (même identifiant ou même nom) sont ignorés.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}
      {lastMessage && (
        <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-sm text-[var(--foreground)]">
          {lastMessage}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {CATALOG_ROWS.map((row) => {
          const busy = busyEntity === row.entity;
          return (
            <div
              key={row.entity}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">{row.label}</p>
                <p className="text-xs text-[var(--muted-foreground)]">{row.hint}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleExport(row.entity)}
                  disabled={busyEntity != null}
                  className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {busy && busyAction === "export" ? "Export…" : "Exporter"}
                </button>
                <button
                  type="button"
                  onClick={() => openImportPicker(row.entity)}
                  disabled={busyEntity != null}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                >
                  {busy && busyAction === "import" ? "Import…" : "Importer"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function labelFor(entity: CatalogEntity): string {
  return CATALOG_ROWS.find((row) => row.entity === entity)?.label ?? entity;
}
