"use client";

import { useCallback, useState } from "react";
import { modalBackdropClose, suppressNextModalBackdropClose } from "@/lib/modal-backdrop-close";
import type { BankAccount } from "@/lib/types";

function displayName(ba: BankAccount): string {
  return ba.company_name !== ba.name ? `${ba.name} – ${ba.company_name}` : ba.name;
}

interface PreviewCandidate {
  id: string;
  transaction_date: string;
  amount: number;
  type: string;
  description: string;
}

interface PreviewRowApi {
  index: number;
  transaction_date: string;
  amount: number;
  description: string;
  type: string;
  match_status: "new" | "possible_duplicate";
  default_import: boolean;
  candidates: PreviewCandidate[];
}

interface ReviewRow extends PreviewRowApi {
  import: boolean;
}

interface CsvMapping {
  date: string;
  description: string;
  amount: string;
  debit: string;
  credit: string;
  type: string;
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

interface ImportBankStatementModalProps {
  bankAccounts: BankAccount[];
  defaultBankAccountId?: string;
  onClose: () => void;
  onSuccess: (insertedCount: number) => void;
}

export function ImportBankStatementModal({
  bankAccounts,
  defaultBankAccountId = "",
  onClose,
  onSuccess,
}: ImportBankStatementModalProps) {
  const [bankAccountId, setBankAccountId] = useState(
    defaultBankAccountId || (bankAccounts[0]?.id ?? "")
  );
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [reviewRows, setReviewRows] = useState<ReviewRow[] | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{ date_from: string; date_to: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [csvMapping, setCsvMapping] = useState<CsvMapping>({
    date: "",
    description: "",
    amount: "",
    debit: "",
    credit: "",
    type: "",
  });

  const normalizeHeader = (input: string): string =>
    input
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]/g, "");

  const detectCsvColumns = useCallback(async (f: File): Promise<string[]> => {
    const text = (await f.text()).replace(/^\uFEFF/, "");
    const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (!firstLine) return [];
    const count = (d: string) => firstLine.split(d).length - 1;
    const delimiter = count(";") >= count(",") && count(";") >= count("\t") ? ";" : count(",") >= count("\t") ? "," : "\t";
    let inQuotes = false;
    let current = "";
    const out: string[] = [];
    for (let i = 0; i < firstLine.length; i += 1) {
      const ch = firstLine[i]!;
      const next = firstLine[i + 1];
      if (ch === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (!inQuotes && ch === delimiter) {
        out.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    out.push(current.trim());
    return out.filter((c) => c.length > 0);
  }, []);

  const guessMappingFromColumns = useCallback((columns: string[]): CsvMapping => {
    const byNorm = new Map(columns.map((c) => [normalizeHeader(c), c]));
    const pick = (...aliases: string[]): string => {
      for (const a of aliases) {
        const hit = byNorm.get(a);
        if (hit) return hit;
      }
      return "";
    };

    return {
      date: pick("date", "dateoperation", "datevaleur", "transactiondate"),
      description: pick("libelle", "description", "label", "memo", "details", "operation"),
      amount: pick("montant", "amount", "valeur"),
      debit: pick("debit"),
      credit: pick("credit"),
      type: pick("type", "sens", "nature", "transactiontype"),
    };
  }, []);

  const isCsvFile = !!file && (file.name.toLowerCase().endsWith(".csv") || file.type.toLowerCase().includes("csv"));

  const resetToUpload = useCallback(() => {
    setStep("upload");
    setReviewRows(null);
    setPreviewMeta(null);
    setError(null);
    setFile(null);
    setCsvColumns([]);
    setCsvMapping({
      date: "",
      description: "",
      amount: "",
      debit: "",
      credit: "",
      type: "",
    });
  }, []);

  const handleAnalyze = async () => {
    setError(null);
    if (!bankAccountId) {
      setError("Sélectionnez un compte.");
      return;
    }
    if (!file) {
      setError("Choisissez un fichier PDF ou CSV.");
      return;
    }
    if (isCsvFile) {
      if (!csvMapping.date) {
        setError("CSV: mappez la colonne Date.");
        return;
      }
      if (!csvMapping.amount && !csvMapping.debit && !csvMapping.credit) {
        setError("CSV: mappez Montant, ou bien Débit/Crédit.");
        return;
      }
    }
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.set("bank_account_id", bankAccountId);
      fd.set("file", file);
      if (isCsvFile) {
        fd.set(
          "csv_mapping",
          JSON.stringify({
            date: csvMapping.date || undefined,
            description: csvMapping.description || undefined,
            amount: csvMapping.amount || undefined,
            debit: csvMapping.debit || undefined,
            credit: csvMapping.credit || undefined,
            type: csvMapping.type || undefined,
          })
        );
      }
      const res = await fetch("/api/transactions/import/preview", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Échec de l'analyse");
      }
      const rows = data.rows as PreviewRowApi[] | undefined;
      if (!Array.isArray(rows)) {
        throw new Error("Réponse serveur invalide.");
      }
      if (rows.length === 0) {
        setError(
          typeof data.message === "string"
            ? data.message
            : "Aucune transaction à importer pour ce relevé."
        );
        return;
      }
      setPreviewMeta({
        date_from: data.date_from ?? "",
        date_to: data.date_to ?? "",
      });
      setReviewRows(
        rows.map((r) => ({
          ...r,
          import: r.default_import,
        }))
      );
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleToggleImport = (index: number, next: boolean) => {
    setReviewRows((prev) =>
      prev
        ? prev.map((r) => (r.index === index ? { ...r, import: next } : r))
        : prev
    );
  };

  const handleCommit = async () => {
    if (!reviewRows?.length) return;
    setError(null);
    if (!reviewRows.some((r) => r.import)) {
      setError("Cochez au moins une ligne à importer, ou fermez la fenêtre.");
      return;
    }
    setCommitting(true);
    try {
      const res = await fetch("/api/transactions/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bank_account_id: bankAccountId,
          items: reviewRows.map((r) => ({
            transaction_date: r.transaction_date,
            amount: r.amount,
            description: r.description,
            type: r.type,
            import: r.import,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Échec de l'import");
      }
      const inserted = typeof data.inserted === "number" ? data.inserted : 0;
      onSuccess(inserted);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCommitting(false);
    }
  };

  const importCount = reviewRows?.filter((r) => r.import).length ?? 0;
  const duplicateCount = reviewRows?.filter((r) => r.match_status === "possible_duplicate").length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => modalBackdropClose(e, onClose)}
    >
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl border border-[var(--primary-muted-border)] bg-[var(--card)] shadow-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary-muted)] text-[var(--primary)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <h3 className="subsection-header text-lg font-medium">Importer un relevé (PDF/CSV)</h3>
              <p className="text-sm text-[var(--muted-foreground)]">
                Analyse par IA. Les lignes déjà présentes en base sont signalées à titre informatif ; vous
                pouvez tout importer, y compris des doublons.
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {step === "upload" ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                  Compte bancaire *
                </label>
                <select
                  value={bankAccountId}
                  onChange={(e) => {
                    suppressNextModalBackdropClose();
                    setBankAccountId(e.target.value);
                  }}
                  onBlur={() => suppressNextModalBackdropClose()}
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                >
                  <option value="">-- Sélectionner --</option>
                  {bankAccounts.map((ba) => (
                    <option key={ba.id} value={ba.id}>
                      {displayName(ba)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                  Relevé (PDF ou CSV) *
                </label>
                <input
                  type="file"
                  accept=".pdf,application/pdf,.csv,text/csv,application/csv,application/vnd.ms-excel"
                  onChange={async (e) => {
                    const nextFile = e.target.files?.[0] ?? null;
                    setError(null);
                    setFile(nextFile);
                    setCsvColumns([]);
                    setCsvMapping({
                      date: "",
                      description: "",
                      amount: "",
                      debit: "",
                      credit: "",
                      type: "",
                    });
                    if (!nextFile) return;
                    const nextIsCsv =
                      nextFile.name.toLowerCase().endsWith(".csv") ||
                      nextFile.type.toLowerCase().includes("csv");
                    if (!nextIsCsv) return;
                    try {
                      const detected = await detectCsvColumns(nextFile);
                      setCsvColumns(detected);
                      setCsvMapping(guessMappingFromColumns(detected));
                    } catch {
                      setError("Impossible de lire l'en-tête CSV. Vérifiez le fichier.");
                    }
                  }}
                  className="block w-full text-sm text-[var(--foreground)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--primary-muted)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--primary)]"
                />
              </div>
              {isCsvFile && (
                <div className="rounded-lg border border-[var(--border)] p-3 space-y-3">
                  <p className="text-sm font-medium text-[var(--foreground)]">Mapping colonnes CSV</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Colonnes détectées: {csvColumns.length > 0 ? csvColumns.join(" • ") : "aucune (vérifiez l'en-tête CSV)"}
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <CsvMapSelect
                      label="Date *"
                      value={csvMapping.date}
                      columns={csvColumns}
                      onChange={(v) => setCsvMapping((prev) => ({ ...prev, date: v }))}
                    />
                    <CsvMapSelect
                      label="Libellé"
                      value={csvMapping.description}
                      columns={csvColumns}
                      onChange={(v) => setCsvMapping((prev) => ({ ...prev, description: v }))}
                    />
                    <CsvMapSelect
                      label="Montant"
                      value={csvMapping.amount}
                      columns={csvColumns}
                      onChange={(v) => setCsvMapping((prev) => ({ ...prev, amount: v }))}
                    />
                    <CsvMapSelect
                      label="Débit"
                      value={csvMapping.debit}
                      columns={csvColumns}
                      onChange={(v) => setCsvMapping((prev) => ({ ...prev, debit: v }))}
                    />
                    <CsvMapSelect
                      label="Crédit"
                      value={csvMapping.credit}
                      columns={csvColumns}
                      onChange={(v) => setCsvMapping((prev) => ({ ...prev, credit: v }))}
                    />
                    <CsvMapSelect
                      label="Type (DEBIT/CREDIT)"
                      value={csvMapping.type}
                      columns={csvColumns}
                      onChange={(v) => setCsvMapping((prev) => ({ ...prev, type: v }))}
                    />
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Requis: Date + (Montant ou Débit/Crédit).
                  </p>
                </div>
              )}
            </div>
          ) : (
            reviewRows && (
              <div className="space-y-3">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Période détectée : {previewMeta?.date_from} → {previewMeta?.date_to}. « Doublon possible » =
                  même date, montant, type et libellé qu&apos;une opération déjà en base (information seule). Toutes
                  les lignes sont cochées par défaut ; décochez celles à ne pas importer.
                </p>
                <div className="rounded-lg border border-[var(--border)] overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-[var(--muted)]/40">
                      <tr>
                        <th className="px-2 py-2 w-10">
                          <span className="sr-only">Importer</span>
                        </th>
                        <th className="px-2 py-2 font-medium">Date</th>
                        <th className="px-2 py-2 font-medium">Type</th>
                        <th className="px-2 py-2 font-medium text-right">Montant</th>
                        <th className="px-2 py-2 font-medium">Libellé</th>
                        <th className="px-2 py-2 font-medium">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewRows.map((r) => (
                        <tr
                          key={r.index}
                          className={
                            r.match_status === "possible_duplicate"
                              ? "border-t border-[var(--border)] bg-amber-500/5"
                              : "border-t border-[var(--border)]"
                          }
                        >
                          <td className="px-2 py-2 align-top">
                            <input
                              type="checkbox"
                              checked={r.import}
                              onChange={(e) => handleToggleImport(r.index, e.target.checked)}
                              aria-label={`Importer la ligne du ${r.transaction_date}`}
                              className="rounded border-[var(--border)]"
                            />
                          </td>
                          <td className="px-2 py-2 align-top tabular-nums whitespace-nowrap">
                            {r.transaction_date}
                          </td>
                          <td className="px-2 py-2 align-top whitespace-nowrap">
                            {r.type === "DEBIT" ? "Débit" : "Crédit"}
                          </td>
                          <td className="px-2 py-2 align-top text-right tabular-nums whitespace-nowrap">
                            {formatEur(r.amount)} €
                          </td>
                          <td className="px-2 py-2 align-top max-w-[240px] break-words">{r.description}</td>
                          <td className="px-2 py-2 align-top text-xs">
                            {r.match_status === "possible_duplicate" ? (
                              <div>
                                <span className="font-medium text-amber-700 dark:text-amber-400">
                                  Doublon possible
                                </span>
                                <ul className="mt-1 list-inside list-disc text-[var(--muted-foreground)]">
                                  {r.candidates.map((c) => (
                                    <li key={c.id}>
                                      {c.transaction_date} · {formatEur(c.amount)} € ·{" "}
                                      {(c.description || "—").slice(0, 60)}
                                      {(c.description?.length ?? 0) > 60 ? "…" : ""}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <span className="text-[var(--muted-foreground)]">Nouveau</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {reviewRows.length} ligne(s) · {duplicateCount} avec doublon possible · {importCount} sélectionnée(s)
                  pour import
                </p>
              </div>
            )
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-[var(--destructive-muted)] bg-[var(--destructive-muted)]/50 px-3 py-2 text-sm text-[var(--destructive)]">
              {error}
            </div>
          )}
        </div>

        <div className="shrink-0 flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          {step === "review" ? (
            <>
              <button
                type="button"
                onClick={resetToUpload}
                disabled={analyzing || committing}
                className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={committing}
                className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={committing || importCount === 0}
                onClick={handleCommit}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:opacity-50 transition-colors shadow-sm"
              >
                {committing ? "Import…" : `Importer (${importCount})`}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={analyzing}
                className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={analyzing}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:opacity-50 transition-colors shadow-sm"
              >
                {analyzing ? "Analyse en cours…" : "Analyser le relevé"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CsvMapSelect({
  label,
  value,
  columns,
  onChange,
}: {
  label: string;
  value: string;
  columns: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-[var(--foreground)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
      >
        <option value="">-- Non mappé --</option>
        {columns.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
