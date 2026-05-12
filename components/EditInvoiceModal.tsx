"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Customer, InvoiceLineItemInput } from "@/lib/types";
import { Select } from "@/components/Select";
import { modalBackdropClose } from "@/lib/modal-backdrop-close";

interface LineItemRow {
  id: string;
  description: string;
  quantity: number;
  unit_price_ttc: number;
  vat_rate: number;
}

interface EditInvoiceModalProps {
  invoiceId: string;
  companyId: string;
  companyName?: string;
  onClose: () => void;
  onSuccess: (invoiceId: string, pdfUrl: string, invoiceNumber: string) => void;
}

interface InvoiceDetailsResponse {
  id: string;
  bank_account_id?: string | null;
  invoice_number: string;
  issue_date: string;
  due_date?: string | null;
  customer_name: string;
  customer_address?: string | null;
  customer_vat?: string | null;
  customer_siret?: string | null;
  line_items: Array<{
    description: string;
    quantity: number;
    amount: number;
    vat_rate?: number;
  }>;
}

function createRowId(): string {
  const maybeCrypto = globalThis.crypto as Crypto | undefined;
  if (maybeCrypto?.randomUUID) return maybeCrypto.randomUUID();
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyRow(defaultVatRate: number): LineItemRow {
  return {
    id: createRowId(),
    description: "",
    quantity: 1,
    unit_price_ttc: 0,
    vat_rate: defaultVatRate,
  };
}

export function EditInvoiceModal({
  invoiceId,
  companyId,
  companyName,
  onClose,
  onSuccess,
}: EditInvoiceModalProps) {
  const [bankAccounts, setBankAccounts] = useState<
    Array<{
      id: string;
      company_id: string;
      name: string;
      bank_name?: string | null;
      ibans?: Array<{ iban: string; bic?: string | null }> | null;
    }>
  >([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>("");
  const [invoiceBankAccountId, setInvoiceBankAccountId] = useState<string>("");

  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerVat, setCustomerVat] = useState("");
  const [customerSiret, setCustomerSiret] = useState("");
  const [issueDate, setIssueDate] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [companyVatRates, setCompanyVatRates] = useState<number[]>([20]);
  const [horsTaxes, setHorsTaxes] = useState(false);
  const [lineItems, setLineItems] = useState<LineItemRow[]>(() => [createEmptyRow(20)]);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const customerListRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoadingInitial(true);
      setError(null);
      try {
        const [invoiceRes, companyRes] = await Promise.all([
          fetch(`/api/invoices/${invoiceId}`),
          fetch(`/api/accounts/${companyId}`),
        ]);
        if (!invoiceRes.ok) {
          const data = await invoiceRes.json().catch(() => ({}));
          throw new Error(typeof data?.error === "string" ? data.error : "Facture introuvable");
        }
        const invoice = (await invoiceRes.json()) as InvoiceDetailsResponse;
        const company = companyRes.ok ? await companyRes.json() : null;
        if (!mounted) return;

        const rates =
          Array.isArray(company?.vat_rates) && company.vat_rates.length > 0
            ? company.vat_rates
            : company?.vat_rate != null
              ? [company.vat_rate]
              : [20];
        setCompanyVatRates(rates);

        setInvoiceNumber(invoice.invoice_number ?? "");
        setCustomerName(invoice.customer_name ?? "");
        setCustomerAddress(invoice.customer_address ?? "");
        setCustomerVat(invoice.customer_vat ?? "");
        setCustomerSiret(invoice.customer_siret ?? "");
        setIssueDate((invoice.issue_date ?? "").slice(0, 10));
        setDueDate((invoice.due_date ?? "").slice(0, 10));
        setInvoiceBankAccountId(
          typeof invoice.bank_account_id === "string" ? invoice.bank_account_id : ""
        );

        const mappedRows =
          Array.isArray(invoice.line_items) && invoice.line_items.length > 0
            ? invoice.line_items
                .map((li) => {
                  const qty = Number(li.quantity);
                  const amount = Number(li.amount);
                  const unitPriceTtc = qty > 0 ? Math.round((amount / qty) * 100) / 100 : 0;
                  const vatRateRaw = Number(li.vat_rate);
                  const vatRate = !Number.isNaN(vatRateRaw) ? vatRateRaw : rates[0] ?? 20;
                  if (!li.description || qty <= 0 || unitPriceTtc <= 0) return null;
                  return {
                    id: createRowId(),
                    description: li.description,
                    quantity: qty,
                    unit_price_ttc: unitPriceTtc,
                    vat_rate: vatRate,
                  } as LineItemRow;
                })
                .filter((row): row is LineItemRow => row !== null)
            : [];
        const safeRows = mappedRows.length > 0 ? mappedRows : [createEmptyRow(rates[0] ?? 20)];
        setLineItems(safeRows);
        setHorsTaxes(safeRows.every((row) => row.vat_rate === 0));
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e.message : "Échec du chargement");
        }
      } finally {
        if (mounted) setLoadingInitial(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [invoiceId, companyId]);

  useEffect(() => {
    if (!companyId) return;
    fetch("/api/bank-accounts")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        const filtered = list.filter((ba) => ba?.company_id === companyId);
        setBankAccounts(filtered);
        setSelectedBankAccountId((prev) => {
          if (prev && filtered.some((ba) => String(ba?.id ?? "") === prev)) return prev;
          if (
            invoiceBankAccountId &&
            filtered.some((ba) => String(ba?.id ?? "") === invoiceBankAccountId)
          ) {
            return invoiceBankAccountId;
          }
          if (filtered.length === 1) return String(filtered[0]?.id ?? "");
          return "";
        });
      })
      .catch(() => {
        setBankAccounts([]);
      });
  }, [companyId, invoiceBankAccountId]);

  const fetchCustomers = useCallback(
    async (search?: string) => {
      if (!companyId) return;
      setLoadingCustomers(true);
      try {
        const params = new URLSearchParams({ company_id: companyId });
        if (search?.trim()) params.set("q", search.trim());
        const res = await fetch(`/api/customers?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setCustomers(Array.isArray(data) ? data : []);
        }
      } finally {
        setLoadingCustomers(false);
      }
    },
    [companyId]
  );

  useEffect(() => {
    if (showCustomerList && companyId) {
      void fetchCustomers(customerName.trim() || undefined);
    }
  }, [showCustomerList, companyId, customerName, fetchCustomers]);

  const handleSelectCustomer = useCallback((c: Customer) => {
    setCustomerName(c.name);
    setCustomerAddress(c.address ?? "");
    setCustomerVat(c.vat_number ?? "");
    setCustomerSiret(c.siret ?? "");
    setShowCustomerList(false);
    nameInputRef.current?.focus();
  }, []);

  const handleNameFocus = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    if (companyId) setShowCustomerList(true);
  }, [companyId]);

  const handleNameBlur = useCallback(() => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    blurTimeoutRef.current = setTimeout(() => {
      blurTimeoutRef.current = null;
      if (!customerListRef.current?.contains(document.activeElement)) {
        setShowCustomerList(false);
      }
    }, 150);
  }, []);

  const defaultVatRate = horsTaxes ? 0 : companyVatRates[0] ?? 20;
  const vatRateOptions = [...new Set([0, ...companyVatRates])].sort((a, b) => a - b);
  const totalLines = useMemo(
    () => lineItems.reduce((sum, row) => sum + row.quantity * row.unit_price_ttc, 0),
    [lineItems]
  );
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const updateLineItem = (id: string, field: keyof LineItemRow, value: string | number) => {
    setLineItems((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };
  const addLine = () => setLineItems((prev) => [...prev, createEmptyRow(defaultVatRate)]);
  const removeLine = (id: string) => {
    setLineItems((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length > 0 ? next : [createEmptyRow(defaultVatRate)];
    });
  };

  const getPayloadLineItems = (): InvoiceLineItemInput[] =>
    lineItems
      .filter((r) => r.description.trim() !== "" && r.quantity > 0 && r.unit_price_ttc > 0)
      .map(({ description, quantity, unit_price_ttc, vat_rate }) => ({
        description: description.trim(),
        quantity,
        unit_price_ttc,
        vat_rate,
      }));

  const canSubmit =
    !loadingInitial &&
    customerName.trim() &&
    issueDate &&
    getPayloadLineItems().length > 0 &&
    !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setError("Le nom du client est requis");
      return;
    }
    if (!issueDate) {
      setError("La date d'émission est requise");
      return;
    }
    if (!invoiceNumber.trim()) {
      setError("Le numéro de facture est requis");
      return;
    }
    if (
      dueDate.trim() &&
      new Date(`${dueDate}T00:00:00Z`).getTime() < new Date(`${issueDate}T00:00:00Z`).getTime()
    ) {
      setError("La date d'échéance doit être postérieure ou égale à la date d'émission");
      return;
    }
    const payloadItems = getPayloadLineItems();
    if (payloadItems.length === 0) {
      setError("Ajoutez au moins une ligne avec description, quantité et prix.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const bankAccountId =
        selectedBankAccountId.trim() ? selectedBankAccountId.trim() : undefined;
      const res = await fetch(`/api/invoices/${invoiceId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank_account_id: bankAccountId,
          invoice_number: invoiceNumber.trim(),
          customer_name: customerName.trim(),
          customer_address: customerAddress.trim() || undefined,
          customer_vat: customerVat.trim() || undefined,
          customer_siret: customerSiret.trim() || undefined,
          issue_date: issueDate,
          ...(dueDate.trim() ? { due_date: dueDate.trim() } : { due_date: "" }),
          line_items: payloadItems,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      }
      onSuccess(data.id, data.pdfUrl, data.invoiceNumber);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la régénération");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => modalBackdropClose(e, onClose)}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="subsection-header mb-4 text-lg font-medium">Modifier et régénérer la facture</h3>

        <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 p-3 text-sm">
          <p className="text-[var(--muted-foreground)]">
            Société : <span className="font-medium text-[var(--foreground)]">{companyName || "—"}</span>
          </p>
          <p className="mt-1 text-[var(--muted-foreground)]">
            Facture : <span className="font-medium text-[var(--foreground)]">{invoiceNumber || "—"}</span>
          </p>
          <p className="mt-1 text-[var(--muted-foreground)]">
            Total lignes : <span className="font-medium text-[var(--foreground)]">{formatCurrency(totalLines)} €</span>
          </p>
        </div>

        {loadingInitial ? (
          <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                Numéro de facture *
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Numéro de facture"
                className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Date d’émission *</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Date d’échéance (optionnel)</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
            </div>

            {bankAccounts.length > 0 && (
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                  Compte bancaire (pour le RIB/IBAN/BIC sur la facture)
                </label>
                <Select
                  value={selectedBankAccountId}
                  onChange={(e) => setSelectedBankAccountId(e.target.value)}
                  className="w-full py-2 text-sm"
                >
                  <option value="">Automatique (premier IBAN de la société)</option>
                  {bankAccounts.map((ba) => {
                    const ibans = Array.isArray(ba.ibans) ? ba.ibans : [];
                    const firstIban = typeof ibans[0]?.iban === "string" ? ibans[0]!.iban : "";
                    const ibanLabel = firstIban ? ` — ${firstIban.slice(0, 6)}…${firstIban.slice(-4)}` : "";
                    const bankLabel = ba.bank_name ? `${ba.bank_name} · ` : "";
                    return (
                      <option key={ba.id} value={ba.id}>
                        {bankLabel}
                        {ba.name}
                        {ibanLabel}
                      </option>
                    );
                  })}
                </Select>
              </div>
            )}

            <div ref={customerListRef} className="relative">
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom du client *</label>
              <input
                ref={nameInputRef}
                type="text"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  if (companyId) setShowCustomerList(true);
                }}
                onFocus={handleNameFocus}
                onBlur={handleNameBlur}
                placeholder="Nom ou raison sociale — rechercher un client existant"
                className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                autoFocus
              />
              {showCustomerList && companyId && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg">
                  {loadingCustomers ? (
                    <div className="px-3 py-2 text-sm text-[var(--muted-foreground)]">Chargement…</div>
                  ) : customers.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-[var(--muted-foreground)]">
                      Aucun client enregistré. Saisissez les informations pour créer un nouveau client.
                    </div>
                  ) : (
                    <ul className="py-1">
                      {customers.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectCustomer(c)}
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
                          >
                            <span className="font-medium">{c.name}</span>
                            {(c.address || c.siret || c.vat_number) && (
                              <span className="ml-2 text-[var(--muted-foreground)]">
                                — {[c.address, c.siret, c.vat_number].filter(Boolean).join(" • ")}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Adresse du client</label>
              <input
                type="text"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Adresse"
                className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">N° TVA client</label>
              <input
                type="text"
                value={customerVat}
                onChange={(e) => setCustomerVat(e.target.value)}
                placeholder="TVA intracommunautaire"
                className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">SIRET client</label>
              <input
                type="text"
                value={customerSiret}
                onChange={(e) => setCustomerSiret(e.target.value)}
                placeholder="SIRET (optionnel)"
                className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={horsTaxes}
                onChange={(e) => {
                  const isHorsTaxes = e.target.checked;
                  setHorsTaxes(isHorsTaxes);
                  const newRate = isHorsTaxes ? 0 : companyVatRates[0] ?? 20;
                  setLineItems((prev) => prev.map((row) => ({ ...row, vat_rate: newRate })));
                }}
                className="rounded border-[var(--border)]"
              />
              <span className="text-sm font-medium">Facture hors taxes</span>
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-[var(--foreground)]">Lignes de produits *</label>
                <button type="button" onClick={addLine} className="text-sm text-[var(--primary)] hover:underline">
                  + Ajouter une ligne
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50">
                      <th className="px-3 py-2 text-left font-medium">Description</th>
                      <th className="w-20 px-3 py-2 text-right font-medium">Qté</th>
                      {!horsTaxes && <th className="w-24 px-3 py-2 text-right font-medium">TVA %</th>}
                      <th className="w-32 px-3 py-2 text-right font-medium">Prix unit. {horsTaxes ? "HT" : "TTC"}</th>
                      <th className="w-10 px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((row) => (
                      <tr key={row.id} className="border-b border-[var(--border)] last:border-b-0">
                        <td className="px-3 py-2">
                          <textarea
                            value={row.description}
                            onChange={(e) => updateLineItem(row.id, "description", e.target.value)}
                            placeholder="Description"
                            rows={2}
                            className="w-full resize-y rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={row.quantity || ""}
                            onChange={(e) =>
                              updateLineItem(row.id, "quantity", Math.max(0, Number(e.target.value) || 0))
                            }
                            className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-right text-sm"
                          />
                        </td>
                        {!horsTaxes && (
                          <td className="px-3 py-2">
                            <Select
                              value={String(row.vat_rate)}
                              onChange={(e) => updateLineItem(row.id, "vat_rate", Number(e.target.value))}
                              className="w-full py-1.5 text-sm"
                            >
                              {vatRateOptions.map((r) => (
                                <option key={r} value={String(r)}>
                                  {r === 0 ? "0% (hors taxes)" : `${r}%`}
                                </option>
                              ))}
                            </Select>
                          </td>
                        )}
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={row.unit_price_ttc || ""}
                            onChange={(e) =>
                              updateLineItem(row.id, "unit_price_ttc", Math.max(0, Number(e.target.value) || 0))
                            }
                            className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-right text-sm"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => removeLine(row.id)}
                            className="text-[var(--muted-foreground)] hover:text-red-600"
                            title="Supprimer"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Régénération…" : "Enregistrer et régénérer"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

