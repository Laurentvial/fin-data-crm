"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type {
  Company,
  CompanyEmail,
  BankAccount,
} from "@/lib/types";

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export default function SocieteDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [emails, setEmails] = useState<CompanyEmail[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [hasLogo, setHasLogo] = useState(false);
  const [hasKbis, setHasKbis] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [addingEmail, setAddingEmail] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingKbis, setUploadingKbis] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [resCompany, resEmails, resBank, resLogo, resKbis] = await Promise.all([
        fetch(`/api/companies/${id}`),
        fetch(`/api/companies/${id}/emails`),
        fetch(`/api/companies/${id}/bank-accounts`),
        fetch(`/api/companies/${id}/files/logo`).then((r) => (r.ok ? r : null)),
        fetch(`/api/companies/${id}/files/kbis`).then((r) => (r.ok ? r : null)),
      ]);

      if (!resCompany.ok) throw new Error("Société introuvable");
      const companyData = await resCompany.json();
      setCompany(companyData);

      if (resEmails.ok) {
        const emailsData = await resEmails.json();
        setEmails(emailsData);
      }

      if (resBank.ok) {
        const bankData = await resBank.json();
        setBankAccounts(bankData);
      }

      setHasLogo(resLogo?.ok ?? false);
      setHasKbis(resKbis?.ok ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddEmail = async () => {
    const email = newEmail.trim();
    const password = newPassword;
    if (!email) return;
    setAddingEmail(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${id}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de l'ajout");
      }
      const added = await res.json();
      setEmails((prev) => [...prev, added].sort((a, b) => a.email.localeCompare(b.email)));
      setNewEmail("");
      setNewPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setAddingEmail(false);
    }
  };

  const handleDeleteEmail = async (emailId: string) => {
    if (!confirm("Supprimer cet email ?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/companies/${id}/emails/${emailId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Échec de la suppression");
      setEmails((prev) => prev.filter((e) => e.id !== emailId));
      setRevealedPasswords((p) => {
        const next = { ...p };
        delete next[emailId];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    }
  };

  const handleRevealPassword = async (emailId: string) => {
    if (revealedPasswords[emailId]) {
      setRevealedPasswords((p) => {
        const next = { ...p };
        delete next[emailId];
        return next;
      });
      return;
    }
    try {
      const res = await fetch(`/api/companies/${id}/emails/${emailId}?password=1`);
      if (!res.ok) throw new Error("Échec");
      const data = await res.json();
      setRevealedPasswords((p) => ({ ...p, [emailId]: data.password ?? "" }));
    } catch {
      setRevealedPasswords((p) => ({ ...p, [emailId]: "—" }));
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "logo");
      const res = await fetch(`/api/companies/${id}/files`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de l'upload");
      }
      setHasLogo(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  };

  const handleUploadKbis = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingKbis(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "kbis");
      const res = await fetch(`/api/companies/${id}/files`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de l'upload");
      }
      setHasKbis(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setUploadingKbis(false);
      e.target.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 overflow-auto p-6">
          <p className="text-[var(--muted-foreground)]">Chargement…</p>
        </main>
      </div>
    );
  }

  if (error && !company) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 overflow-auto p-6">
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
          <Link
            href="/societes"
            className="inline-flex items-center gap-2 text-sm text-[var(--primary)] hover:underline"
          >
            <ChevronLeftIcon />
            Retour aux sociétés
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-auto p-6">
        <Link
          href="/societes"
          className="mb-6 inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeftIcon />
          Retour aux sociétés
        </Link>

        <h1 className="mb-6 text-2xl font-semibold text-[var(--foreground)]">
          {company?.name ?? "Société"}
        </h1>

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
                <dd className="text-sm">{company?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">Adresse</dt>
                <dd className="text-sm">{company?.address ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">Siret</dt>
                <dd className="text-sm">{company?.siret ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-[var(--muted-foreground)]">Directeur</dt>
                <dd className="text-sm">{company?.directeur ?? "—"}</dd>
              </div>
            </dl>
            <Link
              href={`/societes?edit=${id}`}
              className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline"
            >
              Modifier les informations
            </Link>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
            <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">Logo</h2>
            <div className="flex flex-wrap items-start gap-4">
              {hasLogo && (
                <div className="h-24 w-24 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]">
                  <img
                    src={`/api/companies/${id}/files/logo?t=${Date.now()}`}
                    alt="Logo"
                    className="h-full w-full object-contain"
                  />
                </div>
              )}
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] px-6 py-4 hover:border-[var(--primary)]">
                <UploadIcon className="text-[var(--muted-foreground)]" />
                <span className="text-sm text-[var(--muted-foreground)]">
                  {uploadingLogo ? "Upload…" : hasLogo ? "Remplacer" : "Choisir un fichier"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingLogo}
                  onChange={handleUploadLogo}
                />
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
            <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">Kbis</h2>
            <div className="flex flex-wrap items-center gap-4">
              {hasKbis && (
                <a
                  href={`/api/companies/${id}/files/kbis`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--primary)] hover:underline"
                >
                  Télécharger le Kbis
                </a>
              )}
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] px-6 py-4 hover:border-[var(--primary)]">
                <UploadIcon className="text-[var(--muted-foreground)]" />
                <span className="text-sm text-[var(--muted-foreground)]">
                  {uploadingKbis ? "Upload…" : hasKbis ? "Remplacer" : "Choisir un PDF"}
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={uploadingKbis}
                  onChange={handleUploadKbis}
                />
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
            <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">Emails</h2>
            <div className="mb-4 flex flex-wrap gap-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Email"
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mot de passe"
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleAddEmail}
                disabled={addingEmail || !newEmail.trim()}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
              >
                {addingEmail ? "Ajout…" : "Ajouter"}
              </button>
            </div>
            {emails.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">Aucun email enregistré.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="px-4 py-2 text-left font-medium text-[var(--muted-foreground)]">Email</th>
                      <th className="px-4 py-2 text-left font-medium text-[var(--muted-foreground)]">Mot de passe</th>
                      <th className="px-4 py-2 text-right font-medium text-[var(--muted-foreground)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emails.map((em) => (
                      <tr key={em.id} className="border-t border-[var(--border)]">
                        <td className="px-4 py-2">{em.email}</td>
                        <td className="px-4 py-2 font-mono text-xs">
                          {revealedPasswords[em.id] !== undefined ? (
                            revealedPasswords[em.id]
                          ) : (
                            <span className="text-[var(--muted-foreground)]">••••••••</span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRevealPassword(em.id)}
                            className="ml-2 text-[var(--primary)] hover:underline"
                          >
                            {revealedPasswords[em.id] !== undefined ? "Masquer" : "Afficher"}
                          </button>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteEmail(em.id)}
                            className="text-red-600 hover:underline dark:text-red-400"
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
            <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">Comptes bancaires</h2>
            {bankAccounts.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">Aucun compte bancaire lié.</p>
            ) : (
              <ul className="space-y-2">
                {bankAccounts.map((ba) => (
                  <li key={ba.id}>
                    <Link
                      href={`/?bank_account_id=${ba.id}`}
                      className="text-sm text-[var(--primary)] hover:underline"
                    >
                      {ba.name}
                      {ba.balance != null && (
                        <span className="ml-2 text-[var(--muted-foreground)]">
                          (solde: {Number(ba.balance).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €)
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
