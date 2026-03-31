"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { BankAccount } from "@/lib/types";

function displayName(ba: BankAccount): string {
  return ba.company_name !== ba.name ? `${ba.name} – ${ba.company_name}` : ba.name;
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Lundi de la semaine civile (ISO pratique, locale FR). */
function startOfWeekMonday(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = c.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  c.setDate(c.getDate() + diff);
  return c;
}

function endOfWeekFromMonday(monday: Date): Date {
  const end = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return end;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export type DatePresetId =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_7_days"
  | "this_month"
  | "last_30_days"
  | "this_year"
  | "custom";

function rangeForPreset(id: DatePresetId, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (id) {
    case "today":
      return { from: formatYmd(today), to: formatYmd(today) };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: formatYmd(y), to: formatYmd(y) };
    }
    case "this_week": {
      const start = startOfWeekMonday(today);
      const end = endOfWeekFromMonday(start);
      return { from: formatYmd(start), to: formatYmd(end) };
    }
    case "last_7_days":
      return { from: formatYmd(addDays(today, -6)), to: formatYmd(today) };
    case "this_month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: formatYmd(start), to: formatYmd(today) };
    }
    case "last_30_days":
      return { from: formatYmd(addDays(today, -29)), to: formatYmd(today) };
    case "this_year": {
      const start = new Date(today.getFullYear(), 0, 1);
      return { from: formatYmd(start), to: formatYmd(today) };
    }
    case "custom":
    default:
      return { from: customFrom, to: customTo };
  }
}

type AccountTypeRow = { id: string; name: string; emoji?: string | null };
type BankRow = { id: string; name: string };

const PRESET_OPTIONS: { id: DatePresetId; label: string }[] = [
  { id: "today", label: "Aujourd'hui" },
  { id: "yesterday", label: "Hier" },
  { id: "this_week", label: "Cette semaine" },
  { id: "last_7_days", label: "7 derniers jours" },
  { id: "this_month", label: "Ce mois-ci" },
  { id: "last_30_days", label: "30 derniers jours" },
  { id: "this_year", label: "Cette année" },
  { id: "custom", label: "Personnalisée" },
];

function formatMoneyEUR(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function ReportingContent() {
  const searchParams = useSearchParams();
  const bankAccountIdFromUrl = searchParams.get("bank_account_id") ?? searchParams.get("company_id") ?? "";
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);

  const [accessChecked, setAccessChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  const [preset, setPreset] = useState<DatePresetId>("this_month");
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    return formatYmd(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [customTo, setCustomTo] = useState(() => formatYmd(new Date()));

  const [clientId, setClientId] = useState<string>("");
  const [bankId, setBankId] = useState<string>("");
  const [clients, setClients] = useState<AccountTypeRow[]>([]);
  const [banks, setBanks] = useState<BankRow[]>([]);

  const [summary, setSummary] = useState<{
    chiffre_affaires: number;
    debits_total: number;
    credits_count: number;
    debits_count: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveRange = useMemo(
    () => rangeForPreset(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/app-super-admin");
        if (!cancelled) {
          if (!res.ok) {
            setAllowed(false);
          } else {
            const data = await res.json();
            setAllowed(!!data.super_admin);
          }
          setAccessChecked(true);
        }
      } catch {
        if (!cancelled) {
          setAllowed(false);
          setAccessChecked(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      try {
        const [cRes, bRes] = await Promise.all([fetch("/api/account-types"), fetch("/api/banks")]);
        if (cRes.ok && !cancelled) {
          const rows = await cRes.json();
          setClients(Array.isArray(rows) ? rows : []);
        }
        if (bRes.ok && !cancelled) {
          const rows = await bRes.json();
          setBanks(Array.isArray(rows) ? rows : []);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const loadSummary = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    const { from, to } = effectiveRange;
    const params = new URLSearchParams({ date_from: from, date_to: to });
    if (clientId) params.set("client_account_type_id", clientId);
    if (bankId) params.set("bank_id", bankId);
    try {
      const res = await fetch(`/api/reporting/financial-summary?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Erreur de chargement.");
        setSummary(null);
        return;
      }
      setSummary({
        chiffre_affaires: data.chiffre_affaires,
        debits_total: data.debits_total,
        credits_count: data.credits_count,
        debits_count: data.debits_count,
      });
    } catch {
      setError("Erreur réseau.");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [allowed, effectiveRange, clientId, bankId]);

  useEffect(() => {
    if (allowed && accessChecked) {
      loadSummary();
    }
  }, [allowed, accessChecked, loadSummary]);

  if (!accessChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--muted-foreground)]">
        Vérification des accès…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 overflow-auto p-6">
          <h1 className="page-title mb-4 text-2xl font-semibold">Rapports</h1>
          <p className="mb-4 text-[var(--foreground)]">
            Cette page est réservée aux super-administrateurs.
          </p>
          <p className="text-sm text-[var(--muted-foreground)]">
            Un administrateur peut accorder cet accès dans Paramètres → Utilisateurs (colonne « Super-admin »).
          </p>
          <Link href="/dashboard" className="mt-6 inline-block text-sm font-medium text-[var(--primary)] hover:underline">
            Retour au tableau de bord
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-auto p-6">
        <h1 className="page-title mb-2 text-2xl font-semibold">Rapports financiers</h1>
        <p className="mb-6 text-sm text-[var(--muted-foreground)]">
          Chiffre d&apos;affaires (totaux des crédits) et débits sur la période sélectionnée, avec filtres par client et par banque.
        </p>

        {bankAccountIdFromUrl && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            Lien avec compte dans l&apos;URL :{" "}
            <span className="font-medium">{bankAccount ? displayName(bankAccount) : "Compte inconnu"}</span>
            . Les filtres ci-dessous s&apos;appliquent à toutes les transactions (ce lien est informatif).
          </p>
        )}

        <div className="mb-8 flex flex-col gap-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 md:flex-row md:flex-wrap md:items-end">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Période
            </label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as DatePresetId)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              {PRESET_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {preset === "custom" && (
            <>
              <div className="min-w-[140px]">
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Du</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div className="min-w-[140px]">
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Au</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
            </>
          )}
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Client (type de compte)
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              <option value="">Tous les clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji ? `${c.emoji} ` : ""}
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Banque
            </label>
            <select
              value={bankId}
              onChange={(e) => setBankId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              <option value="">Toutes les banques</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={loadSummary}
            disabled={loading}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Calcul…" : "Actualiser"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <p className="mb-4 text-sm text-[var(--muted-foreground)]">
          Période affichée :{" "}
          <span className="font-medium text-[var(--foreground)]">
            {effectiveRange.from} → {effectiveRange.to}
          </span>
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h2 className="text-sm font-medium text-[var(--muted-foreground)]">Chiffre d&apos;affaires (crédits)</h2>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
              {summary ? formatMoneyEUR(summary.chiffre_affaires) : "—"}
            </p>
            {summary != null && (
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                {summary.credits_count} opération{summary.credits_count === 1 ? "" : "s"}
              </p>
            )}
          </section>
          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h2 className="text-sm font-medium text-[var(--muted-foreground)]">Débits</h2>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
              {summary ? formatMoneyEUR(summary.debits_total) : "—"}
            </p>
            {summary != null && (
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                {summary.debits_count} opération{summary.debits_count === 1 ? "" : "s"}
              </p>
            )}
          </section>
        </div>
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
