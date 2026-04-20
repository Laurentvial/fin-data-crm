"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Customer, Transaction } from "@/lib/types";
import type { InvoiceLineItemInput } from "@/lib/types";
import { Select } from "@/components/Select";
import { modalBackdropClose } from "@/lib/modal-backdrop-close";

interface LineItemRow {
  id: string;
  description: string;
  quantity: number;
  unit_price_ttc: number;
  vat_rate: number;
}

interface GenerateInvoiceModalProps {
  /** Une ou plusieurs transactions (même société) couvertes par la facture. */
  transactions: Transaction[];
  onClose: () => void;
  onSuccess: (invoiceId: string, pdfUrl: string, invoiceNumber: string) => void;
}

function createEmptyRow(defaultVatRate: number): LineItemRow {
  return {
    id: crypto.randomUUID(),
    description: "",
    quantity: 1,
    unit_price_ttc: 0,
    vat_rate: defaultVatRate,
  };
}

export function GenerateInvoiceModal({
  transactions,
  onClose,
  onSuccess,
}: GenerateInvoiceModalProps) {
  if (transactions.length === 0) return null;

  const isMulti = transactions.length > 1;
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerVat, setCustomerVat] = useState("");
  const [lineItems, setLineItems] = useState<LineItemRow[]>(() => [
    createEmptyRow(20),
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [companyVatRates, setCompanyVatRates] = useState<number[]>([20]);
  const [horsTaxes, setHorsTaxes] = useState(false);
  const customerListRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const companyId = transactions[0]?.company_id;

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/accounts/${companyId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((company) => {
        const rates = Array.isArray(company?.vat_rates) && company.vat_rates.length > 0
          ? company.vat_rates
          : company?.vat_rate != null
            ? [company.vat_rate]
            : [20];
        setCompanyVatRates(rates);
        setLineItems((prev) =>
          prev.map((row) =>
            rates.includes(row.vat_rate) || row.vat_rate === 0
              ? row
              : { ...row, vat_rate: rates[0] ?? 20 }
          )
        );
      })
      .catch(() => {});
  }, [companyId]);

  const fetchCustomers = useCallback(async (search?: string) => {
    if (!companyId) return;
    setLoadingCustomers(true);
    try {
      const params = new URLSearchParams({ company_id: companyId });
      if (search?.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/customers?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } finally {
      setLoadingCustomers(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (showCustomerList && companyId) {
      fetchCustomers(customerName.trim() || undefined);
    }
  }, [showCustomerList, companyId, customerName, fetchCustomers]);

  const handleSelectCustomer = useCallback((c: Customer) => {
    setCustomerName(c.name);
    setCustomerAddress(c.address ?? "");
    setCustomerVat(c.vat_number ?? "");
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
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
    blurTimeoutRef.current = setTimeout(() => {
      blurTimeoutRef.current = null;
      if (!customerListRef.current?.contains(document.activeElement)) {
        setShowCustomerList(false);
      }
    }, 150);
  }, []);

  const transactionAmount =
    Math.round(
      transactions.reduce((s, t) => s + Math.abs(Number(t.amount)), 0) * 100
    ) / 100;
  const displayAmount = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(transactionAmount);

  const totalLines = lineItems.reduce(
    (sum, row) => sum + row.quantity * row.unit_price_ttc,
    0
  );
  const totalRounded = Math.round(totalLines * 100) / 100;
  const isValidTotal = Math.abs(totalRounded - transactionAmount) < 0.01;

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const updateLineItem = (id: string, field: keyof LineItemRow, value: string | number) => {
    setLineItems((prev) =>
      prev.map((row) =>
        row.id === id ? { ...row, [field]: value } : row
      )
    );
  };

  const defaultVatRate = horsTaxes ? 0 : (companyVatRates[0] ?? 20);
  const vatRateOptions = [...new Set([0, ...companyVatRates])].sort((a, b) => a - b);

  const addLine = () => {
    setLineItems((prev) => [...prev, createEmptyRow(defaultVatRate)]);
  };

  const removeLine = (id: string) => {
    setLineItems((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length > 0 ? next : [createEmptyRow(defaultVatRate)];
    });
  };

  const getPayloadLineItems = (): InvoiceLineItemInput[] =>
    lineItems
      .filter(
        (r) =>
          r.description.trim() !== "" &&
          r.quantity > 0 &&
          r.unit_price_ttc > 0
      )
      .map(({ description, quantity, unit_price_ttc, vat_rate }) => ({
        description: description.trim(),
        quantity,
        unit_price_ttc,
        vat_rate,
      }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setError("Le nom du client est requis");
      return;
    }
    const payloadItems = getPayloadLineItems();
    if (payloadItems.length === 0) {
      setError("Ajoutez au moins une ligne avec description, quantité et prix.");
      return;
    }
    if (!isValidTotal) {
      setError(
        isMulti
          ? "Le total des lignes doit être égal à la somme des montants des transactions sélectionnées."
          : "Le total des lignes doit être égal au montant de la transaction."
      );
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_ids: transactions.map((t) => t.id),
          customer_name: customerName.trim(),
          customer_address: customerAddress.trim() || undefined,
          customer_vat: customerVat.trim() || undefined,
          line_items: payloadItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onSuccess(data.id, data.pdfUrl, data.invoiceNumber);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la génération");
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    customerName.trim() &&
    getPayloadLineItems().length > 0 &&
    isValidTotal &&
    !saving;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => modalBackdropClose(e, onClose)}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="subsection-header mb-4 text-lg font-medium">
          {isMulti ? `Générer une facture groupée (${transactions.length})` : "Générer une facture"}
        </h3>
        <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 p-3 text-sm">
          {isMulti ? (
            <>
              <p className="text-[var(--muted-foreground)]">
                Société : {transactions[0]?.company_name ?? "—"} · Montant total cible :{" "}
                <span className="font-medium text-[var(--foreground)]">{displayAmount} €</span>
              </p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[var(--muted-foreground)]">
                {transactions.map((t) => {
                  const num = Number(t.amount);
                  const mag = Math.abs(num);
                  const signed =
                    t.type === "DEBIT"
                      ? -mag
                      : mag;
                  const line = new Intl.NumberFormat("fr-FR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(signed);
                  return (
                    <li key={t.id} className="truncate text-xs">
                      <span className="tabular-nums">{(t.transaction_date ?? "").slice(0, 10)}</span>
                      {" · "}
                      {t.description || "—"} — {line} €
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              <p className="text-[var(--muted-foreground)]">
                Transaction : {transactions[0]?.description || "—"} |{" "}
                {transactions[0]?.company_name ?? "—"}
              </p>
              <p className="mt-1 font-medium">
                Montant :{" "}
                {new Intl.NumberFormat("fr-FR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(
                  transactions[0]!.type === "DEBIT"
                    ? -Math.abs(Number(transactions[0]!.amount))
                    : Math.abs(Number(transactions[0]!.amount))
                )}{" "}
                €
              </p>
            </>
          )}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div ref={customerListRef} className="relative">
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Nom du client *
            </label>
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
                  <div className="px-3 py-2 text-sm text-[var(--muted-foreground)]">
                    Chargement…
                  </div>
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
                          {(c.address || c.vat_number) && (
                            <span className="ml-2 text-[var(--muted-foreground)]">
                              — {[c.address, c.vat_number].filter(Boolean).join(" • ")}
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
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Adresse du client
            </label>
            <input
              type="text"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="Adresse"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              N° TVA client
            </label>
            <input
              type="text"
              value={customerVat}
              onChange={(e) => setCustomerVat(e.target.value)}
              placeholder="TVA intracommunautaire"
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
                const newRate = isHorsTaxes ? 0 : (companyVatRates[0] ?? 20);
                setLineItems((prev) => prev.map((row) => ({ ...row, vat_rate: newRate })));
              }}
              className="rounded border-[var(--border)]"
            />
            <span className="text-sm font-medium">Facture hors taxes</span>
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--foreground)]">
                Lignes de produits *
              </label>
              <button
                type="button"
                onClick={addLine}
                className="text-sm text-[var(--primary)] hover:underline"
              >
                + Ajouter une ligne
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50">
                    <th className="px-3 py-2 text-left font-medium">Description</th>
                    <th className="w-20 px-3 py-2 text-right font-medium">Qté</th>
                    {!horsTaxes && (
                      <th className="w-24 px-3 py-2 text-right font-medium">TVA %</th>
                    )}
                    <th className="w-32 px-3 py-2 text-right font-medium">
                      Prix unit. {horsTaxes ? "HT" : "TTC"}
                    </th>
                    <th className="w-10 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--border)] last:border-b-0"
                    >
                      <td className="px-3 py-2">
                        <textarea
                          value={row.description}
                          onChange={(e) =>
                            updateLineItem(row.id, "description", e.target.value)
                          }
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
                            updateLineItem(
                              row.id,
                              "quantity",
                              Math.max(0, Number(e.target.value) || 0)
                            )
                          }
                          className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-right text-sm"
                        />
                      </td>
                      {!horsTaxes && (
                        <td className="px-3 py-2">
                          <Select
                            value={String(row.vat_rate)}
                            onChange={(e) =>
                              updateLineItem(
                                row.id,
                                "vat_rate",
                                Number(e.target.value)
                              )
                            }
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
                            updateLineItem(
                              row.id,
                              "unit_price_ttc",
                              Math.max(0, Number(e.target.value) || 0)
                            )
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
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">
                Total lignes : <strong>{formatCurrency(totalRounded)} €</strong>
              </span>
              <span className="text-[var(--muted-foreground)]">
                Montant cible : <strong>{formatCurrency(transactionAmount)} €</strong>
                {isValidTotal ? (
                  <span className="ml-2 text-green-600">✓ OK</span>
                ) : (
                  <span className="ml-2 text-red-600">✗ Écart</span>
                )}
              </span>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
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
              {saving ? "Génération…" : "Générer la facture"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
