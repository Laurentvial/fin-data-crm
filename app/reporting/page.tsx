"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Company } from "@/lib/types";

export default function ReportingPage() {
  const searchParams = useSearchParams();
  const companyIdFromUrl = searchParams.get("company_id") ?? "";
  const [company, setCompany] = useState<Company | null>(null);

  const fetchCompany = useCallback(async () => {
    if (!companyIdFromUrl) return;
    try {
      const res = await fetch("/api/companies");
      if (!res.ok) return;
      const companies: Company[] = await res.json();
      const found = companies.find((c) => c.id === companyIdFromUrl);
      setCompany(found ?? null);
    } catch {
      setCompany(null);
    }
  }, [companyIdFromUrl]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-auto p-6">
        <h1 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">Rapports</h1>
        {companyIdFromUrl && (
          <p className="mb-4 text-sm text-[var(--muted-foreground)]">
            Filtre actif : <span className="font-medium text-[var(--foreground)]">{company?.name ?? "Société sélectionnée"}</span>
          </p>
        )}
        <p className="text-[var(--muted-foreground)]">Cette page est un placeholder. Les rapports et analyses seront disponibles ici.</p>
      </main>
    </div>
  );
}
