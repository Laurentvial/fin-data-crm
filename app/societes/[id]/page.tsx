"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AccountVignette } from "@/components/AccountVignette";
import { CreateBankAccountModal } from "@/components/CreateBankAccountModal";
import type {
  Bank,
  Company,
  CompanyEmail,
  CompanyPhone,
  BankAccount,
  Transaction,
  IbanItem,
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

function PdfIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`h-28 w-28 text-red-600 dark:text-red-400 ${className ?? ""}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-label="PDF"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2 5 5h-5V4zM8 12h1v4H8v-4zm4 0h1v4h-1v-4zm-2 2h1v2h-1v-2zm4-2h1v4h-1v-4z" />
    </svg>
  );
}

export default function SocieteDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [emails, setEmails] = useState<CompanyEmail[]>([]);
  const [phones, setPhones] = useState<CompanyPhone[]>([]);
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
  const [newPhone, setNewPhone] = useState("");
  const [addingPhone, setAddingPhone] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [createAccountModalOpen, setCreateAccountModalOpen] = useState(false);
  const [createAccountName, setCreateAccountName] = useState("");
  const [createAccountBankId, setCreateAccountBankId] = useState("");
  const [createAccountIbans, setCreateAccountIbans] = useState<IbanItem[]>([]);
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
      const [resCompany, resEmails, resPhones, resBank, resBanks, resLogo, resKbis] = await Promise.all([
        fetch(`/api/accounts/${id}`),
        fetch(`/api/accounts/${id}/emails`),
        fetch(`/api/accounts/${id}/phones`),
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

      if (resPhones.ok) {
        const phonesData = await resPhones.json();
        setPhones(phonesData);
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

  const handleAddPhone = async () => {
    const phone = newPhone.trim();
    if (!phone) return;
    setAddingPhone(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}/phones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de l'ajout");
      }
      const added = await res.json();
      setPhones((prev) => [...prev, added].sort((a, b) => a.phone.localeCompare(b.phone)));
      setNewPhone("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setAddingPhone(false);
    }
  };

  const handleDeletePhone = async (phoneId: string) => {
    if (!confirm("Supprimer ce numéro ?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}/phones/${phoneId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Échec de la suppression");
      setPhones((prev) => prev.filter((p) => p.id !== phoneId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
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

  const openCreateAccountModal = () => {
    setCreateAccountModalOpen(true);
    setCreateAccountName("");
    setCreateAccountBankId("");
    setCreateAccountIbans([]);
    setBankAccountError(null);
    setBankAccountInviteWarning(null);
  };

  const closeCreateAccountModal = () => {
    setCreateAccountModalOpen(false);
    setBankAccountError(null);
    setBankAccountInviteWarning(null);
  };

  const handleAddBankAccount = async () => {
    const name = createAccountName.trim();
    if (!name) return;
    setAddingBankAccount(true);
    setBankAccountError(null);
    try {
      const ibansToSend = createAccountIbans
        .map((v) => ({
          iban: v.iban.trim().replace(/\s/g, "").toUpperCase(),
          bic: (v.bic ?? "").trim().replace(/\s/g, "").toUpperCase() || undefined,
        }))
        .filter((v) => v.iban.length > 0);
      const body: { name: string; company_id: string; bank_id?: string; ibans: IbanItem[] } = {
        name,
        company_id: id,
        ibans: ibansToSend,
      };
      if (createAccountBankId) body.bank_id = createAccountBankId;
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
        closeCreateAccountModal();
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,200px)_1fr_minmax(0,180px)]">
            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">Logo</h2>
              <label className="group flex cursor-pointer flex-col items-start gap-2 rounded-lg py-2 min-h-[120px] w-full">
                {hasLogo ? (
                  <div className="relative w-full min-h-[80px] flex-1">
                    <div className="w-full h-full min-h-[80px] overflow-hidden rounded-lg bg-[var(--muted)]">
                      <img
                        src={`/api/accounts/${id}/files/logo?t=${Date.now()}`}
                        alt="Logo"
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)]">
                        {uploadingLogo ? "Upload…" : "Remplacer"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <UploadIcon className="text-[var(--muted-foreground)]" />
                    <span className="text-sm text-[var(--muted-foreground)]">
                      {uploadingLogo ? "Upload…" : "Choisir un fichier"}
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingLogo}
                  onChange={handleUploadLogo}
                />
              </label>
            </section>

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
              <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">Kbis</h2>
              <label className="group flex cursor-pointer flex-col items-center justify-center gap-0 rounded-lg py-0 min-h-[120px] w-full">
                {hasKbis ? (
                  <div className="relative w-full min-h-[120px] flex-1 flex flex-col items-center justify-center p-0">
                    <PdfIcon className="my-0 shrink-0" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <a
                        href={`/api/accounts/${id}/files/kbis`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
                      >
                        Voir Kbis
                      </a>
                      <span className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)]">
                        {uploadingKbis ? "Upload…" : "Remplacer"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="text-sm text-[var(--muted-foreground)]">
                    {uploadingKbis ? "Upload…" : "Choisir un PDF"}
                  </span>
                )}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={uploadingKbis}
                  onChange={handleUploadKbis}
                />
              </label>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
              <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">Numéros de téléphone</h2>
              <div className="mb-4 flex flex-wrap gap-2">
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Numéro de téléphone"
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddPhone}
                  disabled={addingPhone || !newPhone.trim()}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {addingPhone ? "Ajout…" : "Ajouter"}
                </button>
              </div>
              {phones.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">Aucun numéro enregistré.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="px-4 py-2 text-left font-medium text-[var(--muted-foreground)]">Numéro</th>
                        <th className="px-4 py-2 text-right font-medium text-[var(--muted-foreground)]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phones.map((ph) => (
                        <tr key={ph.id} className="border-t border-[var(--border)]">
                          <td className="px-4 py-2">{ph.phone}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeletePhone(ph.id)}
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
          </div>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-medium text-[var(--foreground)]">Comptes bancaires</h2>
              <button
                type="button"
                onClick={openCreateAccountModal}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
              >
                Ajouter un compte bancaire
              </button>
            </div>
            {!createAccountModalOpen && bankAccountError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                {bankAccountError}
              </div>
            )}
            {!createAccountModalOpen && bankAccountInviteWarning && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {bankAccountInviteWarning}
              </div>
            )}
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

      {createAccountModalOpen && company && (
        <CreateBankAccountModal
          companies={[company]}
          banks={banks}
          name={createAccountName}
          companyId={id}
          bankId={createAccountBankId}
          ibans={createAccountIbans}
          onNameChange={(v) => {
            setCreateAccountName(v);
            if (bankAccountError) setBankAccountError(null);
          }}
          onCompanyIdChange={() => {}}
          onBankIdChange={(v) => {
            setCreateAccountBankId(v);
            if (bankAccountError) setBankAccountError(null);
          }}
          onIbansChange={(v) => {
            setCreateAccountIbans(v);
            if (bankAccountError) setBankAccountError(null);
          }}
          onSubmit={handleAddBankAccount}
          onClose={closeCreateAccountModal}
          saving={addingBankAccount}
          error={bankAccountError}
          inviteWarning={bankAccountInviteWarning}
          fixedCompanyId={id}
        />
      )}
    </div>
  );
}
