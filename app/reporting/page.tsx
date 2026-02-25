"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { BankAccount } from "@/lib/types";

function displayName(ba: BankAccount): string {
  return ba.company_name !== ba.name ? `${ba.company_name} – ${ba.name}` : ba.name;
}

function ReportingContent() {
  const searchParams = useSearchParams();
  const bankAccountIdFromUrl = searchParams.get("bank_account_id") ?? searchParams.get("company_id") ?? "";
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);

  const fetchBankAccount = useCallback(async () => {
    if (!bankAccountIdFromUrl) return;
    try {
      const res = await fetch("/api/bank-accounts");
      if (!res.ok) return;
      const accounts: BankAccount[] = await res.json();
      const found = accounts.find((ba) => ba.id === bankAccountIdFromUrl);
      setBankAccount(found ?? null);
    } catch {
      setBankAccount(null);
    }
  }, [bankAccountIdFromUrl]);

  useEffect(() => {
    fetchBankAccount();
  }, [fetchBankAccount]);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-auto p-6">
        <h1 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">Rapports</h1>
        {bankAccountIdFromUrl && (
          <p className="mb-4 text-sm text-[var(--muted-foreground)]">
            Filtre actif : <span className="font-medium text-[var(--foreground)]">{bankAccount ? displayName(bankAccount) : "Compte sélectionné"}</span>
          </p>
        )}
        <p className="text-[var(--muted-foreground)]">Cette page est un placeholder. Les rapports et analyses seront disponibles ici.</p>
      </main>
    </div>
  );
}

export default function ReportingPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Chargement...</div>}>
      <ReportingContent />
    </Suspense>
  );
}
