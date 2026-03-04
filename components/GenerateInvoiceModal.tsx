"use client";

import React, { useState } from "react";
import type { Transaction } from "@/lib/types";
import type { InvoiceLineItemInput } from "@/lib/types";

interface LineItemRow {
  id: string;
  description: string;
  quantity: number;
  unit_price_ttc: number;
}

interface GenerateInvoiceModalProps {
  transaction: Transaction;
  onClose: () => void;
  onSuccess: (invoiceId: string, pdfUrl: string, invoiceNumber: string) => void;
}

function createEmptyRow(): LineItemRow {
  return {
    id: crypto.randomUUID(),
    description: "",
    quantity: 1,
    unit_price_ttc: 0,
  };
}

export function GenerateInvoiceModal({
  transaction,
  onClose,
  onSuccess,
}: GenerateInvoiceModalProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerVat, setCustomerVat] = useState("");
  const [lineItems, setLineItems] = useState<LineItemRow[]>(() => [
    createEmptyRow(),
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = Number(transaction.amount);
  const transactionAmount = Math.abs(amount);
  const displayAmount = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(transaction.type === "DEBIT" ? -transactionAmount : transactionAmount);

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

  const addLine = () => {
    setLineItems((prev) => [...prev, createEmptyRow()]);
  };

  const removeLine = (id: string) => {
    setLineItems((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length > 0 ? next : [createEmptyRow()];
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
      .map(({ description, quantity, unit_price_ttc }) => ({
        description: description.trim(),
        quantity,
        unit_price_ttc,
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
      setError("Le total des lignes doit être égal au montant de la transaction.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: transaction.id,
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
      onSuccess(data.id, data.pdf_url, data.invoice_number);
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
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-medium text-[var(--foreground)]">
          Générer une facture
        </h3>
        <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 p-3 text-sm">
          <p className="text-[var(--muted-foreground)]">
            Transaction : {transaction.description || "—"} |{" "}
            {transaction.company_name ?? "—"}
          </p>
          <p className="mt-1 font-medium">Montant : {displayAmount} €</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Nom du client *
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nom ou raison sociale"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              autoFocus
            />
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
                    <th className="w-32 px-3 py-2 text-right font-medium">
                      Prix unit. TTC
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
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) =>
                            updateLineItem(row.id, "description", e.target.value)
                          }
                          placeholder="Description"
                          className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
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
