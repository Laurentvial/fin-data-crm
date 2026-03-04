"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Invoice } from "@/lib/types";

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export default function SocieteFacturesPage() {
  const params = useParams();
  const id = params.id as string;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [companyName, setCompanyName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [resInvoices, resCompany] = await Promise.all([
        fetch(`/api/invoices?company_id=${id}`),
        fetch(`/api/accounts/${id}`),
      ]);
      if (!resInvoices.ok) throw new Error("Échec du chargement des factures");
      const invoicesData = await resInvoices.json();
      setInvoices(Array.isArray(invoicesData) ? invoicesData : []);

      if (resCompany.ok) {
        const companyData = await resCompany.json();
        setCompanyName(companyData.name ?? "Société");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatDate = (d: string) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatAmount = (n: number, currency: string) => {
    return new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n) + " " + currency;
  };

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-auto p-6">
        <Link
          href={`/societes/${id}`}
          className="mb-6 inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeftIcon />
          Retour à {companyName || "la société"}
        </Link>

        <h1 className="mb-6 text-2xl font-semibold text-[var(--foreground)]">
          Factures – {companyName || "Société"}
        </h1>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-[var(--muted-foreground)]">Chargement…</p>
        ) : invoices.length === 0 ? (
          <p className="text-[var(--muted-foreground)]">Aucune facture pour cette société.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/50">
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">N°</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Client</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--muted-foreground)]">Montant</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Statut</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--muted-foreground)]">PDF</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3 font-medium">{inv.invoice_number}</td>
                    <td className="px-4 py-3">{formatDate(inv.issue_date)}</td>
                    <td className="px-4 py-3">{inv.customer_name}</td>
                    <td className="px-4 py-3 text-right">{formatAmount(inv.total, inv.currency)}</td>
                    <td className="px-4 py-3">{inv.status}</td>
                    <td className="px-4 py-3 text-right">
                      {inv.pdf_url ? (
                        <a
                          href={`/api/invoices/${inv.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--primary)] hover:underline"
                        >
                          Voir la facture
                        </a>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
