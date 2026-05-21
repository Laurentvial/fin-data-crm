"use client";

import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { getCachedSession, invalidateSessionCache } from "@/lib/auth/session-cache";
import type { BankAccount, Company } from "@/lib/types";

const navMainBase = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboardIcon },
  { href: "/", label: "Toutes les transactions", icon: GridIcon },
  { href: "/societes", label: "Sociétés", icon: BriefcaseIcon },
  { href: "/accounts", label: "Comptes", icon: BuildingIcon },
  { href: "/reporting", label: "Rapports", icon: ChartIcon, superAdminOnly: true as const },
] as const;

const navAdmin = [
  { href: "/settings", label: "Paramètres", icon: SettingsIcon },
];

function LayoutDashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function BriefcaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M8 10h.01M8 14h.01M16 14h.01" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Awaited<ReturnType<typeof authClient.getSession>>["data"]>(null);
  const [isPending, setIsPending] = useState(true);
  const [appSuperAdmin, setAppSuperAdmin] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const [quickSearchDataLoaded, setQuickSearchDataLoaded] = useState(false);
  const [quickSearchLoading, setQuickSearchLoading] = useState(false);
  const [quickSearchError, setQuickSearchError] = useState<string | null>(null);
  const [quickCompanies, setQuickCompanies] = useState<Company[]>([]);
  const [quickBankAccounts, setQuickBankAccounts] = useState<BankAccount[]>([]);

  const navMain = useMemo(() => {
    return navMainBase.filter(
      (item) => !("superAdminOnly" in item) || appSuperAdmin
    );
  }, [appSuperAdmin]);

  const fetchSession = useCallback(async () => {
    try {
      const data = await getCachedSession();
      setSession(data);
      try {
        const res = await fetch("/api/me/app-super-admin");
        if (res.ok) {
          const body = await res.json();
          setAppSuperAdmin(!!body.super_admin);
        } else {
          setAppSuperAdmin(false);
        }
      } catch {
        setAppSuperAdmin(false);
      }
    } catch {
      setSession(null);
      setAppSuperAdmin(false);
    } finally {
      setIsPending(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchSession();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [fetchSession]);

  const initials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const loadQuickSearchData = useCallback(async () => {
    if (quickSearchDataLoaded || quickSearchLoading) return;
    setQuickSearchLoading(true);
    setQuickSearchError(null);
    try {
      const [companiesRes, accountsRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/bank-accounts"),
      ]);
      if (!companiesRes.ok || !accountsRes.ok) {
        throw new Error("Impossible de charger les données de recherche");
      }
      const [companiesData, accountsData] = await Promise.all([
        companiesRes.json(),
        accountsRes.json(),
      ]);
      setQuickCompanies(Array.isArray(companiesData) ? companiesData : []);
      setQuickBankAccounts(Array.isArray(accountsData) ? accountsData : []);
      setQuickSearchDataLoaded(true);
    } catch {
      setQuickSearchError("Recherche indisponible");
    } finally {
      setQuickSearchLoading(false);
    }
  }, [quickSearchDataLoaded, quickSearchLoading]);

  const quickSearchResults = useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    if (!q) return [];

    const companyHits = quickCompanies
      .filter((company) => {
        const name = (company.name ?? "").toLowerCase();
        const directeur = (company.directeur ?? "").toLowerCase();
        return name.includes(q) || directeur.includes(q);
      })
      .slice(0, 4)
      .map((company) => ({
        key: `company:${company.id}`,
        href: `/societes/${company.id}`,
        title: company.name,
        subtitle: "Société",
      }));

    const accountHits = quickBankAccounts
      .filter((account) => {
        const name = (account.name ?? "").toLowerCase();
        const companyName = (account.company_name ?? "").toLowerCase();
        return name.includes(q) || companyName.includes(q);
      })
      .slice(0, 4)
      .map((account) => ({
        key: `account:${account.id}`,
        href: `/?bank_account_id=${encodeURIComponent(account.id)}`,
        title: account.name,
        subtitle: `Compte${account.company_name ? ` · ${account.company_name}` : ""}`,
      }));

    return [...accountHits, ...companyHits].slice(0, 6);
  }, [quickSearch, quickCompanies, quickBankAccounts]);

  const handleSignOut = async () => {
    invalidateSessionCache();
    await authClient.signOut();
    router.push("/auth/sign-in");
    router.refresh();
  };

  const handleQuickSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (quickSearchResults.length === 0) return;
    const first = quickSearchResults[0];
    router.push(first.href);
    setQuickSearch("");
  };

  return (
    <aside className="sticky top-0 z-40 flex h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] scrollbar-hide">
      <nav className="flex flex-1 flex-col gap-1 p-3 pt-4">
        {navMain.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon as React.ComponentType<{ className?: string }>;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                isActive
                  ? "bg-[var(--primary-muted)] text-[var(--primary)] border-l-2 border-[var(--primary)] -ml-0.5 pl-3.5"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] border-l-2 border-transparent"
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-[var(--primary)]" : ""}`} />
              {item.label}
            </Link>
          );
        })}
        <div className="my-2 border-t border-[var(--border)] pt-2">
          <p className="subsection-header px-3 text-xs font-semibold uppercase tracking-wider">
            Administration
          </p>
        </div>
        {navAdmin.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                isActive
                  ? "bg-[var(--primary-muted)] text-[var(--primary)] border-l-2 border-[var(--primary)] -ml-0.5 pl-3.5"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] border-l-2 border-transparent"
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-[var(--primary)]" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[var(--sidebar-border)] p-3">
        <form onSubmit={handleQuickSearchSubmit} className="relative mb-3 px-3">
          {quickSearch.trim() && (
            <div className="absolute inset-x-3 bottom-full z-50 mb-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 shadow-[var(--card-hover-shadow)]">
              {quickSearchLoading && (
                <p className="px-2 py-1 text-xs text-[var(--muted-foreground)]">Chargement…</p>
              )}
              {!quickSearchLoading && quickSearchError && (
                <p className="px-2 py-1 text-xs text-[var(--destructive)]">{quickSearchError}</p>
              )}
              {!quickSearchLoading && !quickSearchError && quickSearchResults.length === 0 && (
                <p className="px-2 py-1 text-xs text-[var(--muted-foreground)]">Aucun résultat</p>
              )}
              {!quickSearchLoading && !quickSearchError && quickSearchResults.length > 0 && (
                <div className="space-y-0.5">
                  {quickSearchResults.map((result) => (
                    <Link
                      key={result.key}
                      href={result.href}
                      onClick={() => setQuickSearch("")}
                      className="block rounded-md px-2 py-1.5 hover:bg-[var(--muted)]"
                    >
                      <p className="truncate text-sm text-[var(--foreground)]">{result.title}</p>
                      <p className="truncate text-xs text-[var(--muted-foreground)]">{result.subtitle}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
          <input
            type="search"
            value={quickSearch}
            onFocus={loadQuickSearchData}
            onChange={(e) => setQuickSearch(e.target.value)}
            placeholder="Recherche rapide compte/société…"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            aria-label="Recherche rapide compte ou société"
          />
        </form>
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary-muted)] text-[var(--primary)] font-semibold ring-2 ring-[var(--primary-muted-border)]">
            <span className="text-xs font-medium">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--foreground)]">
              {isPending ? "..." : session?.user?.name ?? "Utilisateur"}
            </p>
            <p className="truncate text-xs text-[var(--muted-foreground)]">
              {isPending
                ? "..."
                : appSuperAdmin
                  ? "Super-administrateur"
                  : session?.user?.role === "admin"
                    ? "Administrateur"
                    : "Utilisateur"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--destructive-muted)] hover:text-[var(--destructive)] transition-colors"
        >
          <LogOutIcon />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
