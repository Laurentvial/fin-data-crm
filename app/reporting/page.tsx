"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { FinancialTrendChart, type TrendPoint } from "@/components/reporting/FinancialTrendChart";
import {
  CategoryBreakdownChart,
  type CategoryBreakdownPoint,
} from "@/components/reporting/CategoryBreakdownChart";
import { SearchableSelect } from "@/components/SearchableSelect";
import { canMutate } from "@/lib/auth/permissions";
import { getCachedSession } from "@/lib/auth/session-cache";
import type { BankAccount, Company } from "@/lib/types";

function displayName(ba: BankAccount): string {
  return ba.company_name !== ba.name ? `${ba.name} – ${ba.company_name}` : ba.name;
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Affichage jj/mm/aaaa pour une date ISO yyyy-mm-dd. */
function formatIsoToFr(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Saisie jj/mm/aaaa → yyyy-mm-dd ou null si invalide. */
function parseFrToIso(s: string): string | null {
  const t = s.trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return formatYmd(d);
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
  | "last_month"
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
    case "last_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: formatYmd(start), to: formatYmd(end) };
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
  { id: "last_month", label: "Le mois dernier" },
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const bankAccountIdFromUrl = searchParams.get("bank_account_id") ?? searchParams.get("company_id") ?? "";
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);

  const [accessChecked, setAccessChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [sessionRoleLoading, setSessionRoleLoading] = useState(true);
  const canAccessReportingPage = canMutate(sessionRole);

  const [preset, setPreset] = useState<DatePresetId>("this_month");
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    return formatYmd(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [customTo, setCustomTo] = useState(() => formatYmd(new Date()));
  const [customFromInput, setCustomFromInput] = useState(() => {
    const d = new Date();
    return formatIsoToFr(formatYmd(new Date(d.getFullYear(), d.getMonth(), 1)));
  });
  const [customToInput, setCustomToInput] = useState(() => formatIsoToFr(formatYmd(new Date())));

  const [companyId, setCompanyId] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [bankId, setBankId] = useState<string>("");
  const [companies, setCompanies] = useState<Pick<Company, "id" | "name">[]>([]);
  const [clients, setClients] = useState<AccountTypeRow[]>([]);
  const [banks, setBanks] = useState<BankRow[]>([]);

  const [summary, setSummary] = useState<{
    chiffre_affaires: number;
    debits_total: number;
    credits_count: number;
    debits_count: number;
    expenses_by_category: CategoryBreakdownPoint[];
    revenue_by_category: CategoryBreakdownPoint[];
  } | null>(null);
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  const [trendGranularity, setTrendGranularity] = useState<"day" | "hour">("day");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveRange = useMemo(
    () => rangeForPreset(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const companyOptions = useMemo(
    () => companies.map((co) => ({ value: co.id, label: co.name })),
    [companies]
  );
  const clientOptions = useMemo(
    () =>
      clients.map((c) => ({
        value: c.id,
        label: `${c.emoji ? `${c.emoji} ` : ""}${c.name}`,
      })),
    [clients]
  );
  const bankOptions = useMemo(
    () => banks.map((b) => ({ value: b.id, label: b.name })),
    [banks]
  );

  useEffect(() => {
    if (preset !== "custom") return;
    setCustomFromInput(formatIsoToFr(customFrom));
    setCustomToInput(formatIsoToFr(customTo));
  }, [preset]);

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
        const session = await getCachedSession();
        if (cancelled) return;
        setSessionRole(session?.user?.role ?? null);
      } catch {
        if (!cancelled) setSessionRole(null);
      } finally {
        if (!cancelled) setSessionRoleLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionRoleLoading && !canAccessReportingPage) {
      router.replace("/societes");
    }
  }, [canAccessReportingPage, router, sessionRoleLoading]);

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
        const [accRes, cRes, bRes] = await Promise.all([
          fetch("/api/accounts"),
          fetch("/api/account-types"),
          fetch("/api/banks"),
        ]);
        if (accRes.ok && !cancelled) {
          const rows = await accRes.json();
          const list = Array.isArray(rows) ? (rows as Company[]) : [];
          setCompanies(list.map((co) => ({ id: co.id, name: co.name })));
        }
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
    if (companyId) params.set("company_id", companyId);
    if (clientId) params.set("client_account_type_id", clientId);
    if (bankId) params.set("bank_id", bankId);
    try {
      const qs = params.toString();
      const [sumRes, tsRes] = await Promise.all([
        fetch(`/api/reporting/financial-summary?${qs}`),
        fetch(`/api/reporting/financial-timeseries?${qs}`),
      ]);
      const data = await sumRes.json();
      if (!sumRes.ok) {
        setError(typeof data.error === "string" ? data.error : "Erreur de chargement.");
        setSummary(null);
        setTrendPoints([]);
        setTrendGranularity("day");
        return;
      }
      setSummary({
        chiffre_affaires: data.chiffre_affaires,
        debits_total: data.debits_total,
        credits_count: data.credits_count,
        debits_count: data.debits_count,
        expenses_by_category: Array.isArray(data.expenses_by_category) ? data.expenses_by_category : [],
        revenue_by_category: Array.isArray(data.revenue_by_category) ? data.revenue_by_category : [],
      });
      if (tsRes.ok) {
        const tsJson = await tsRes.json();
        setTrendPoints(Array.isArray(tsJson.points) ? tsJson.points : []);
        setTrendGranularity(tsJson.granularity === "hour" ? "hour" : "day");
      } else {
        setTrendPoints([]);
        setTrendGranularity("day");
      }
    } catch {
      setError("Erreur réseau.");
      setSummary(null);
      setTrendPoints([]);
      setTrendGranularity("day");
    } finally {
      setLoading(false);
    }
  }, [allowed, effectiveRange, companyId, clientId, bankId]);

  useEffect(() => {
    if (allowed && accessChecked) {
      loadSummary();
    }
  }, [allowed, accessChecked, loadSummary]);

  if (sessionRoleLoading || !accessChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--muted-foreground)]">
        Vérification des accès…
      </div>
    );
  }

  if (!canAccessReportingPage) return null;

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
          Chiffre d&apos;affaires (totaux des crédits) et débits sur la période sélectionnée, avec filtres par société, client et banque.
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
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">
                  Du <span className="font-normal text-[var(--muted-foreground)]">(jj/mm/aaaa)</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="jj/mm/aaaa"
                  value={customFromInput}
                  onChange={(e) => setCustomFromInput(e.target.value)}
                  onBlur={() => {
                    const p = parseFrToIso(customFromInput);
                    if (p) {
                      setCustomFrom(p);
                      setCustomFromInput(formatIsoToFr(p));
                    } else {
                      setCustomFromInput(formatIsoToFr(customFrom));
                    }
                  }}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div className="min-w-[140px]">
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">
                  Au <span className="font-normal text-[var(--muted-foreground)]">(jj/mm/aaaa)</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="jj/mm/aaaa"
                  value={customToInput}
                  onChange={(e) => setCustomToInput(e.target.value)}
                  onBlur={() => {
                    const p = parseFrToIso(customToInput);
                    if (p) {
                      setCustomTo(p);
                      setCustomToInput(formatIsoToFr(p));
                    } else {
                      setCustomToInput(formatIsoToFr(customTo));
                    }
                  }}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
            </>
          )}
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Société
            </label>
            <SearchableSelect
              value={companyId}
              onChange={setCompanyId}
              options={companyOptions}
              emptyLabel="Toutes les sociétés"
              ariaLabel="Filtrer par société"
              className="w-full"
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Client (type de compte)
            </label>
            <SearchableSelect
              value={clientId}
              onChange={setClientId}
              options={clientOptions}
              emptyLabel="Tous les clients"
              ariaLabel="Filtrer par client (type de compte)"
              className="w-full"
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Banque
            </label>
            <SearchableSelect
              value={bankId}
              onChange={setBankId}
              options={bankOptions}
              emptyLabel="Toutes les banques"
              ariaLabel="Filtrer par banque"
              className="w-full"
            />
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
            {formatIsoToFr(effectiveRange.from)} → {formatIsoToFr(effectiveRange.to)}
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

        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h2 className="subsection-header mb-1 text-base font-medium">
            {trendGranularity === "hour" ? "Évolution par heure" : "Évolution quotidienne"}
          </h2>
          <p className="mb-4 max-w-3xl text-xs text-[var(--muted-foreground)]">
            {trendGranularity === "hour" ? (
              <>
                Période de moins de 48 h : montants agrégés par heure (fuseau Europe/Paris), selon la date
                d&apos;enregistrement des transactions. Ligne verte : crédits. Ligne rouge : débits.
              </>
            ) : (
              <>
                Montants enregistrés par jour (chaque point = total des crédits ou des débits ce jour-là). Ligne
                verte : chiffre d&apos;affaires (crédits). Ligne rouge : débits.
              </>
            )}
          </p>
          {loading && trendPoints.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Chargement du graphique…</p>
          ) : (
            <FinancialTrendChart points={trendPoints} granularity={trendGranularity} />
          )}
        </section>

        <div className="mt-8 grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h2 className="subsection-header mb-1 text-base font-medium">
              Dépenses par catégorie
            </h2>
            <p className="mb-4 text-xs text-[var(--muted-foreground)]">
              Total des débits ventilé par catégorie de dépense sur la période.
            </p>
            <CategoryBreakdownChart
              points={summary?.expenses_by_category ?? []}
              color="var(--destructive)"
            />
          </section>
          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h2 className="subsection-header mb-1 text-base font-medium">
              Revenus par catégorie
            </h2>
            <p className="mb-4 text-xs text-[var(--muted-foreground)]">
              Total des crédits ventilé par catégorie sur la période.
            </p>
            <CategoryBreakdownChart
              points={summary?.revenue_by_category ?? []}
              color="var(--primary)"
            />
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
