"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Company } from "@/lib/types";

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/companies");
      if (!res.ok) throw new Error("Failed to fetch companies");
      const data = await res.json();
      setCompanies(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-auto p-6">
        <h1 className="mb-6 text-2xl font-semibold text-[var(--foreground)]">Sociétés</h1>
        {loading ? (
          <p className="text-[var(--muted-foreground)]">Chargement…</p>
        ) : companies.length === 0 ? (
          <p className="text-[var(--muted-foreground)]">Aucune société.</p>
        ) : (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Société
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr
                    key={company.id}
                    className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)]/50"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--foreground)]">{company.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/?company_id=${encodeURIComponent(company.id)}`}
                          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
                        >
                          <ListIcon className="h-4 w-4" />
                          Voir les transactions
                        </Link>
                        <Link
                          href={`/reporting?company_id=${encodeURIComponent(company.id)}`}
                          className="inline-flex items-center gap-2 rounded-lg border border-[var(--primary)] bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                        >
                          <ChartIcon className="h-4 w-4" />
                          Rapports
                        </Link>
                      </div>
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
