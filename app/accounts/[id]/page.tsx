"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { canMutate } from "@/lib/auth/permissions";
import { getCachedSession } from "@/lib/auth/session-cache";
import type { BankAccount } from "@/lib/types";

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [sessionRoleLoading, setSessionRoleLoading] = useState(true);
  const canEditData = canMutate(sessionRole);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bank-accounts/${id}`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 404) throw new Error("Compte introuvable");
        throw new Error("Échec du chargement");
      }
      const data = await res.json();
      setBankAccount(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    let mounted = true;
    const loadSessionRole = async () => {
      try {
        const session = await getCachedSession();
        if (!mounted) return;
        setSessionRole(session?.user?.role ?? null);
      } catch {
        if (mounted) setSessionRole(null);
      } finally {
        if (mounted) setSessionRoleLoading(false);
      }
    };
    void loadSessionRole();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionRoleLoading && !canEditData) {
      router.replace("/dashboard");
    }
  }, [canEditData, router, sessionRoleLoading]);

  if (loading || sessionRoleLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 overflow-auto p-6">
          <p className="text-[var(--muted-foreground)]">Chargement…</p>
        </main>
      </div>
    );
  }

  if (!canEditData) return null;

  if (error && !bankAccount) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 overflow-auto p-6">
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
          <Link
            href="/accounts"
            className="inline-flex items-center gap-2 text-sm text-[var(--primary)] hover:underline"
          >
            <ChevronLeftIcon />
            Retour aux comptes
          </Link>
        </main>
      </div>
    );
  }

  const balance = bankAccount?.balance ?? 0;
  const ibans = bankAccount?.ibans ?? [];
  const cards = bankAccount?.cards ?? [];

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-auto p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/accounts"
            className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <ChevronLeftIcon />
            Retour aux comptes
          </Link>
          {canEditData && (
            <Link
              href={`/accounts?edit=${id}`}
              className="text-sm text-[var(--primary)] hover:underline"
            >
              Modifier les informations
            </Link>
          )}
        </div>

        <div className="mb-6 flex items-center gap-4">
          {bankAccount?.bank_id && bankAccount.has_logo && (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]">
              <img
                src={`/api/banks/${bankAccount.bank_id}/files/logo`}
                alt=""
                className="h-full w-full object-contain"
              />
            </div>
          )}
          <h1 className="page-title text-2xl font-semibold">
            {bankAccount?.name ?? "Compte"}
          </h1>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-8">
          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
            <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">Informations</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">Nom</dt>
                <dd className="text-sm">{bankAccount?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">Société</dt>
                <dd className="text-sm">
                  {bankAccount?.company_id ? (
                    <Link
                      href={`/societes/${bankAccount.company_id}`}
                      className="text-[var(--primary)] hover:underline"
                    >
                      {bankAccount.company_name ?? "—"}
                    </Link>
                  ) : (
                    bankAccount?.company_name ?? "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">Banque</dt>
                <dd className="text-sm">{bankAccount?.bank_name ?? "—"}</dd>
              </div>
              {bankAccount?.bank_url && (
                <div>
                  <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">Lien de la banque</dt>
                  <dd className="text-sm">
                    <a
                      href={bankAccount.bank_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--primary)] hover:underline"
                    >
                      {bankAccount.bank_url}
                    </a>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">Solde</dt>
                <dd className="text-sm font-medium tabular-nums">
                  {new Intl.NumberFormat("fr-FR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                    signDisplay: "always",
                  }).format(balance)}{" "}
                  €
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">Telegram Chat ID</dt>
                <dd className="text-sm font-mono">{bankAccount?.telegram_chat_id ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">Email de la société</dt>
                <dd className="text-sm">{bankAccount?.company_email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">Téléphone de la société</dt>
                <dd className="text-sm">{bankAccount?.company_phone ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">Identifiants</dt>
                <dd className="mt-1 space-y-1">
                  <div>
                    <span className="text-xs text-[var(--muted-foreground)]">Login : </span>
                    <span className="text-sm">{bankAccount?.login ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-[var(--muted-foreground)]">Mot de passe : </span>
                    <span className="text-sm">{bankAccount?.password ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-[var(--muted-foreground)]">Code PIN : </span>
                    <span className="text-sm">{bankAccount?.pin_code ?? "—"}</span>
                  </div>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">Plafond / limite</dt>
                <dd className="text-sm">{bankAccount?.plafond_limit ?? "—"}</dd>
              </div>
              {bankAccount?.has_rib && (
                <div>
                  <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">RIB</dt>
                  <dd className="text-sm">
                    <a
                      href={`/api/bank-accounts/${id}/files/rib`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--primary)] hover:underline"
                    >
                      Voir le document RIB
                    </a>
                  </dd>
                </div>
              )}
              {ibans.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">IBAN</dt>
                  <dd className="mt-1 space-y-1">
                    {ibans.map((item, i) => {
                      const iban = typeof item === "string" ? item : item.iban;
                      const bic = typeof item === "string" ? undefined : item.bic;
                      return (
                        <p key={`${iban}-${i}`} className="font-mono text-sm">
                          {iban}
                          {bic && <span className="ml-2 text-[var(--muted-foreground)]">BIC: {bic}</span>}
                        </p>
                      );
                    })}
                  </dd>
                </div>
              )}
              {cards.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">Cartes bleues</dt>
                  <dd className="mt-1 space-y-2">
                    {cards.map((item, i) => {
                      const card = typeof item === "object" && item && "numero" in item
                        ? item as { numero: string; date_expiration?: string | null; cvv?: string | null }
                        : null;
                      if (!card) return null;
                      return (
                        <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                          <p className="font-mono text-sm">
                            {card.numero}
                            {card.date_expiration && (
                              <span className="ml-2 text-[var(--muted-foreground)]">Exp: {card.date_expiration}</span>
                            )}
                            {card.cvv && (
                              <span className="ml-2 text-[var(--muted-foreground)]">CVV: {card.cvv}</span>
                            )}
                          </p>
                        </div>
                      );
                    })}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
            <h2 className="section-header mb-4 text-lg font-medium">Actions</h2>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/?bank_account_id=${encodeURIComponent(id)}`}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
              >
                <ListIcon />
                Voir les transactions
              </Link>
              <Link
                href={`/reporting?bank_account_id=${encodeURIComponent(id)}`}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--primary)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
              >
                <ChartIcon />
                Rapports
              </Link>
              {bankAccount?.company_id && (
                <Link
                  href={`/societes/${bankAccount.company_id}/comptes`}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
                >
                  <ExternalLinkIcon />
                  Comptes de la société
                </Link>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
