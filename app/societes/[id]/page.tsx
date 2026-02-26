"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BankSelect } from "@/components/BankSelect";
import { AccountVignette } from "@/components/AccountVignette";
import type {
  Bank,
  Company,
  CompanyEmail,
  BankAccount,
  Transaction,
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
  const [transactionsByAccount, setTransactionsByAccount] = useState<
    Record<string, Transaction[]>
  >({});
  const [hasLogo, setHasLogo] = useState(false);
  const [hasKbis, setHasKbis] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [addingEmail, setAddingEmail] = useState(false);
  const [newBankAccountName, setNewBankAccountName] = useState("");
  const [newBankAccountBankId, setNewBankAccountBankId] = useState("");
  const [newBankAccountIbans, setNewBankAccountIbans] = useState<string[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [addingBankAccount, setAddingBankAccount] = useState(false);
  const [bankAccountError, setBankAccountError] = useState<string | null>(null);
  const [bankAccountInviteWarning, setBankAccountInviteWarning] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingKbis, setUploadingKbis] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [resCompany, resEmails, resBank, resBanks, resLogo, resKbis] = await Promise.all([
        fetch(`/api/accounts/${id}`),
        fetch(`/api/accounts/${id}/emails`),
        fetch(`/api/accounts/${id}/bank-accounts`),
        fetch("/api/banks"),
        fetch(`/api/accounts/${id}/files/logo`).then((r) => (r.ok ? r : null)),
        fetch(`/api/accounts/${id}/files/kbis`).then((r) => (r.ok ? r : null)),
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

        const txMap: Record<string, Transaction[]> = {};
        await Promise.all(
          bankData.map(async (ba: BankAccount) => {
            const resTx = await fetch(
              `/api/transactions?bank_account_id=${ba.id}&limit=5`
            );
            if (resTx.ok) {
              const txData = await resTx.json();
              txMap[ba.id] = txData;
            } else {
              txMap[ba.id] = [];
            }
          })
        );
        setTransactionsByAccount(txMap);
      }

      if (resBanks.ok) {
        const banksData = await resBanks.json();
        setBanks(Array.isArray(banksData) ? banksData : []);
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
      const res = await fetch(`/api/accounts/${id}/emails`, {
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
      const res = await fetch(`/api/accounts/${id}/emails/${emailId}`, { method: "DELETE" });
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
      const res = await fetch(`/api/accounts/${id}/emails/${emailId}?password=1`);
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
      const res = await fetch(`/api/accounts/${id}/files`, {
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
      const res = await fetch(`/api/accounts/${id}/files`, {
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

  const handleAddBankAccount = async () => {
    const name = newBankAccountName.trim();
    if (!name) return;
    setAddingBankAccount(true);
    setBankAccountError(null);
    try {
      const ibansToSend = newBankAccountIbans
        .map((v) => v.trim().replace(/\s/g, "").toUpperCase())
        .filter((v) => v.length > 0);
      const body: { name: string; company_id: string; bank_id?: string; ibans: string[] } = {
        name,
        company_id: id,
        ibans: ibansToSend,
      };
      if (newBankAccountBankId) body.bank_id = newBankAccountBankId;
      const res = await fetch("/api/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de l'ajout");
      }
      const added = await res.json();
      setBankAccounts((prev) => [...prev, added].sort((a, b) => a.name.localeCompare(b.name)));
      setNewBankAccountName("");
      setNewBankAccountBankId("");
      setNewBankAccountIbans([]);
      setBankAccountError(null);
      const warnings = added.telegram_invite_warnings as { telegram_id: number; name?: string; telegram_username?: string; reason: string }[] | undefined;
      if (Array.isArray(warnings) && warnings.length > 0) {
        const names = warnings.map((w) => w.name || (w.telegram_username ? `@${w.telegram_username}` : `ID ${w.telegram_id}`));
        const reasonMsg =
          warnings.some((w) => w.reason === "UserNotMutualContactError")
            ? "Ils doivent être dans les contacts du compte Telegram admin."
            : warnings.some((w) => w.reason === "UserPrivacyRestrictedError")
              ? "Paramètres de confidentialité Telegram : la personne doit aller dans Paramètres → Confidentialité → Groupes et canaux → « Qui peut vous ajouter aux groupes » et choisir « Tout le monde » ou « Mes contacts »."
              : warnings.length > 0
                ? `Raison technique : ${warnings.map((w) => w.reason).filter(Boolean).join(", ")}`
                : null;
        setBankAccountInviteWarning(
          `${warnings.length} utilisateur(s) n'ont pas pu être ajoutés : ${names.join(", ")}. ${reasonMsg ?? ""}`
        );
      } else {
        setBankAccountInviteWarning(null);
      }
    } catch (e) {
      setBankAccountError(e instanceof Error ? e.message : "Erreur inconnue");
      setBankAccountInviteWarning(null);
    } finally {
      setAddingBankAccount(false);
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
                    src={`/api/accounts/${id}/files/logo?t=${Date.now()}`}
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
                  href={`/api/accounts/${id}/files/kbis`}
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
            {bankAccountError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                {bankAccountError}
              </div>
            )}
            {bankAccountInviteWarning && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {bankAccountInviteWarning}
              </div>
            )}
            <div className="mb-4 space-y-3">
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Nom du compte</label>
                  <input
                    type="text"
                    value={newBankAccountName}
                    onChange={(e) => {
                      setNewBankAccountName(e.target.value);
                      if (bankAccountError) setBankAccountError(null);
                      if (bankAccountInviteWarning) setBankAccountInviteWarning(null);
                    }}
                    placeholder="Ex. Compte courant"
                    className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Banque</label>
                  <BankSelect
                    value={newBankAccountBankId}
                    onChange={setNewBankAccountBankId}
                    banks={banks}
                    placeholder="Aucune banque"
                    className="min-w-[160px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddBankAccount}
                  disabled={addingBankAccount || !newBankAccountName.trim()}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {addingBankAccount ? "Création…" : "Ajouter un compte bancaire"}
                </button>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-[var(--muted-foreground)]">IBAN (optionnel)</label>
                  <button
                    type="button"
                    onClick={() => setNewBankAccountIbans((p) => [...p, ""])}
                    className="text-xs text-[var(--primary)] hover:underline"
                  >
                    + Ajouter un IBAN
                  </button>
                </div>
                {newBankAccountIbans.length > 0 && (
                  <div className="mt-1 space-y-2">
                    {newBankAccountIbans.map((iban, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          value={iban}
                          onChange={(e) => {
                            const next = [...newBankAccountIbans];
                            next[i] = e.target.value;
                            setNewBankAccountIbans(next);
                          }}
                          placeholder="FR76 1234 5678 9012 3456 7890 123"
                          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setNewBankAccountIbans((p) => p.filter((_, idx) => idx !== i))}
                          className="rounded-lg border border-[var(--border)] px-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="mb-4 text-xs text-[var(--muted-foreground)]">
              Un groupe Telegram sera créé automatiquement et lié au compte.
            </p>
            {bankAccounts.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">Aucun compte bancaire lié.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {bankAccounts.map((ba) => (
                  <AccountVignette
                    key={ba.id}
                    bankAccount={ba}
                    transactions={transactionsByAccount[ba.id] ?? []}
                    hideCompanyName
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
