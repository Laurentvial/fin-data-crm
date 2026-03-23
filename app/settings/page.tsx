"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AccountNameField } from "@/components/AccountNameField";
import { authClient } from "@/lib/auth/client";
import { getCachedSession } from "@/lib/auth/session-cache";
import type { AccountStatus, AccountType, Bank, InvoiceTemplate, Source } from "@/lib/types";

type User = { id: string; email: string; name: string; role?: string; telegram_id?: number; telegram_username?: string };

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function StarIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

type UserTelegramStatus = {
  linked: boolean;
  telegram_id?: number;
  telegram_username?: string;
  updated_at?: string;
};

function UserTelegramLinkSection() {
  const [status, setStatus] = useState<UserTelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlinkPending, setUnlinkPending] = useState(false);
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const rawBotUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim();
  const botUsername = rawBotUsername ? rawBotUsername.replace(/^@+/, "") : "";
  const botUsernameValid = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(botUsername);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me/telegram");
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
      } else {
        setError(data.error ?? "Erreur");
      }
    } catch {
      setError("Service inaccessible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("telegram") === "linked") {
      fetchStatus();
      window.history.replaceState({}, "", "/settings");
    }
    if (params.get("telegram_error")) {
      const err = params.get("telegram_error");
      setError(
        err === "invalid"
          ? "Données Telegram invalides. Vérifiez que : (1) le domaine est lié dans BotFather avec /setdomain, (2) NEXT_PUBLIC_TELEGRAM_BOT_USERNAME est le nom du bot sans @ (ex. MonBot), (3) TELEGRAM_BOT_TOKEN est correct."
          : err === "config"
            ? "Le bot Telegram n'est pas configuré (TELEGRAM_BOT_TOKEN manquant)."
            : err === "domain" || err === "domain_invalid"
              ? "Domaine du bot invalide. Dans @BotFather, envoyez /setdomain à votre bot, puis indiquez le domaine exact de ce site (ex. monapp.com sans https://). En local : utilisez ngrok ou Cloudflare Tunnel et enregistrez l’URL temporaire."
              : "Erreur de configuration Telegram."
      );
      window.history.replaceState({}, "", "/settings");
    }
  }, [fetchStatus]);

  useEffect(() => {
    if (!status?.linked && botUsernameValid && widgetContainerRef.current && !widgetContainerRef.current.querySelector("script")) {
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.setAttribute("data-telegram-login", botUsername);
      script.setAttribute("data-size", "large");
      script.setAttribute("data-auth-url", `${typeof window !== "undefined" ? window.location.origin : ""}/settings/telegram-callback`);
      script.async = true;
      widgetContainerRef.current.appendChild(script);
    }
  }, [status?.linked, botUsername, botUsernameValid]);

  const handleUnlink = async () => {
    if (!confirm("Délier votre compte Telegram ? Vous ne serez plus ajouté aux nouveaux groupes.")) return;
    setUnlinkPending(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me/telegram", { method: "DELETE" });
      if (res.ok) {
        setStatus({ linked: false });
      } else {
        const data = await res.json();
        setError(data.error ?? "Échec");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setUnlinkPending(false);
    }
  };

  if (loading) {
    return (
      <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="section-header mb-4 text-lg font-medium">Mon Telegram</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="section-header mb-4 text-lg font-medium">Mon Telegram</h2>
      <p className="mb-4 text-sm text-[var(--muted-foreground)]">
        Liez votre compte Telegram pour être automatiquement ajouté aux groupes créés lors de l&apos;ajout de comptes bancaires.
        <span className="mt-2 block text-xs">
          Astuce : ajoutez le compte admin Telegram à vos contacts. Vérifiez aussi que Paramètres → Confidentialité → Groupes et canaux → « Qui peut vous ajouter aux groupes » est sur « Tout le monde » ou « Mes contacts ».
        </span>
        {botUsernameValid && (
          <span className="mt-2 block text-xs">
            Si rien ne se passe au clic : autorisez les popups pour ce site, et désactivez temporairement « Bloquer les cookies tiers » (Paramètres du navigateur). Si le widget affiche « Bot domain invalid » : dans @BotFather, envoyez <code className="font-mono">/setdomain</code> à votre bot, puis saisissez le domaine exact de ce site (ex. <code className="font-mono">monapp.com</code> sans https://). En développement local, utilisez ngrok ou Cloudflare Tunnel et enregistrez l&apos;URL générée.
          </span>
        )}
      </p>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}
      {status?.linked ? (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-950">
          <span className="text-sm text-green-800 dark:text-green-200">
            Compte lié
            {status.telegram_username && ` (@${status.telegram_username})`}
          </span>
          <button
            type="button"
            onClick={handleUnlink}
            disabled={unlinkPending}
            className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-100 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900"
          >
            {unlinkPending ? "…" : "Délier"}
          </button>
        </div>
      ) : botUsernameValid ? (
        <div>
          <p className="mb-2 text-xs text-[var(--muted-foreground)]">
            Cliquez sur le bouton ci-dessous pour lier votre compte Telegram (il peut afficher votre identifiant, ex. « Log in as … »). Autorisez les popups si une fenêtre ne s&apos;ouvre pas.
          </p>
          <div ref={widgetContainerRef} className="min-h-[50px]" />
        </div>
      ) : botUsername ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Nom de bot invalide : <code className="font-mono">{rawBotUsername || "(vide)"}</code>. Utilisez 5–32 caractères (lettres, chiffres, underscore), sans @. Ex. : <code className="font-mono">MonBot</code>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">
          Le bot Telegram n&apos;est pas configuré. Demandez à l&apos;administrateur d&apos;ajouter NEXT_PUBLIC_TELEGRAM_BOT_USERNAME.
        </p>
      )}
    </section>
  );
}

function UserRow({
  user,
  currentUserId,
  onDelete,
  onSetRole,
  onEdit,
}: {
  user: User;
  currentUserId: string | null;
  onDelete: (u: User) => void;
  onSetRole: (userId: string, role: "user" | "admin") => void;
  onEdit: (u: User) => void;
}) {
  const isSelf = user.id === currentUserId;
  return (
    <tr className="border-t border-[var(--border)]">
      <td className="px-4 py-2 text-[var(--foreground)]">{user.name}</td>
      <td className="px-4 py-2 text-[var(--foreground)]">{user.email}</td>
      <td className="px-4 py-2">
        <select
          value={user.role ?? "user"}
          onChange={(e) => onSetRole(user.id, e.target.value as "user" | "admin")}
          disabled={isSelf}
          className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm disabled:opacity-50"
          title={isSelf ? "Vous ne pouvez pas modifier votre propre rôle" : undefined}
        >
          <option value="user">Utilisateur</option>
          <option value="admin">Administrateur</option>
        </select>
      </td>
      <td className="px-4 py-2 text-[var(--foreground)]">{user.telegram_id != null ? (
        <span className="font-mono text-sm" title={user.telegram_username ? `@${user.telegram_username}` : undefined}>
          {user.telegram_id}
          {user.telegram_username && ` (@${user.telegram_username})`}
        </span>
      ) : (
        <span className="text-[var(--muted-foreground)]">—</span>
      )}</td>
      <td className="px-4 py-2 text-right">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onEdit(user)}
            className="rounded px-2 py-1 text-sm text-[var(--primary)] hover:bg-[var(--primary-muted)]"
          >
            Modifier
          </button>
          <button
            type="button"
            onClick={() => onDelete(user)}
            disabled={isSelf}
            className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed dark:text-red-400 dark:hover:bg-red-950"
            title={isSelf ? "Vous ne pouvez pas vous supprimer" : "Supprimer"}
          >
            Supprimer
          </button>
        </div>
      </td>
    </tr>
  );
}

function EditUserModal({
  user,
  name,
  email,
  onNameChange,
  onEmailChange,
  onSave,
  onClose,
}: {
  user: User;
  name: string;
  email: string;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="subsection-header mb-4 text-lg font-medium">
          Modifier {user.name}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

type TelegramStatus = {
  authorized: boolean;
  user?: { first_name: string; username: string; phone?: string };
  error?: string;
};

function TelegramConnectionSection() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"phone" | "code" | "password">("phone");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram-auth/status");
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
      } else {
        setStatus({ authorized: false, error: data.error ?? "Erreur" });
      }
    } catch {
      setStatus({ authorized: false, error: "Service inaccessible" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleRequestCode = async () => {
    const p = phone.trim();
    if (!p) {
      setError("Entrez votre numéro (ex. +33612345678)");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram-auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p }),
      });
      const data = await res.json();
      if (res.ok && data.authorized) {
        setStatus({ authorized: true, user: data.user });
        setStep("phone");
      } else if (res.ok) {
        setStep("code");
      } else {
        setError(data.error ?? "Erreur lors de l'envoi du code");
      }
    } catch {
      setError("Service inaccessible");
    } finally {
      setPending(false);
    }
  };

  const handleConfirm = async () => {
    const p = phone.trim();
    const c = code.trim();
    if (!p || !c) {
      setError("Numéro et code requis");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram-auth/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p, code: c, password: password.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ authorized: true, user: data.user });
        setStep("phone");
        setCode("");
        setPassword("");
      } else if (data.error === "password_required") {
        setStep("password");
      } else {
        setError(data.error ?? "Code invalide ou expiré");
      }
    } catch {
      setError("Service inaccessible");
    } finally {
      setPending(false);
    }
  };

  const resetFlow = () => {
    setStep("phone");
    setCode("");
    setPassword("");
    setError(null);
  };

  if (loading) {
    return (
      <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="section-header mb-4 text-lg font-medium">
          Connexion Telegram
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="section-header mb-4 text-lg font-medium">
        Connexion Telegram
      </h2>
      <p className="mb-4 text-sm text-[var(--muted-foreground)]">
        Connectez votre compte Telegram pour créer automatiquement des groupes lors de l&apos;ajout de comptes bancaires.
      </p>

      {status?.error && !status.authorized && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {status.error}
        </div>
      )}

      {status?.authorized && status.user ? (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-950">
          <span className="text-sm text-green-800 dark:text-green-200">
            Connecté en tant que <strong>{status.user.first_name}</strong>
            {status.user.username && ` (@${status.user.username})`}
          </span>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
              {error}
            </div>
          )}

          {step === "phone" && (
            <div className="flex flex-wrap gap-2">
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setError(null);
                }}
                placeholder="+33612345678"
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleRequestCode}
                disabled={pending}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Envoi…" : "Envoyer le code"}
              </button>
            </div>
          )}

          {step === "code" && (
            <div className="space-y-2">
              <p className="text-sm text-[var(--muted-foreground)]">
                Code reçu sur Telegram pour {phone}
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setError(null);
                  }}
                  placeholder="12345"
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={pending}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Vérification…" : "Confirmer"}
                </button>
                <button
                  type="button"
                  onClick={resetFlow}
                  className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {step === "password" && (
            <div className="space-y-2">
              <p className="text-sm text-[var(--muted-foreground)]">
                Compte protégé par mot de passe (2FA). Entrez votre mot de passe Telegram.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Mot de passe"
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={pending}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Vérification…" : "Confirmer"}
                </button>
                <button
                  type="button"
                  onClick={resetFlow}
                  className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function BanksSection() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createUrl, setCreateUrl] = useState("");
  const [createLogoFile, setCreateLogoFile] = useState<File | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null);
  const [editPending, setEditPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [banksListExpanded, setBanksListExpanded] = useState(true);

  const fetchBanks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/banks");
      if (!res.ok) throw new Error("Échec du chargement");
      const data = await res.json();
      setBanks(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBanks();
  }, [fetchBanks]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;
    setCreatePending(true);
    setError(null);
    try {
      const res = await fetch("/api/banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url: createUrl.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la création");
      }
      const created = await res.json();
      if (createLogoFile) {
        const formData = new FormData();
        formData.append("file", createLogoFile);
        formData.append("type", "logo");
        const uploadRes = await fetch(`/api/banks/${created.id}/files`, {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          const uploadData = await uploadRes.json();
          throw new Error(uploadData.error ?? "Échec de l'upload du logo");
        }
      }
      setBanks((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCreateName("");
      setCreateUrl("");
      setCreateLogoFile(null);
      setCreateModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setCreatePending(false);
    }
  };

  const openCreateModal = () => {
    setCreateModalOpen(true);
    setCreateName("");
    setCreateUrl("");
    setCreateLogoFile(null);
    setError(null);
  };

  const handleEdit = async () => {
    if (!editingBank) return;
    const name = editName.trim();
    if (!name) return;
    setEditPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/banks/${editingBank.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url: editUrl.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la mise à jour");
      }
      const updated = await res.json();
      if (editLogoFile) {
        const formData = new FormData();
        formData.append("file", editLogoFile);
        formData.append("type", "logo");
        const uploadRes = await fetch(`/api/banks/${editingBank.id}/files`, {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          const uploadData = await uploadRes.json();
          throw new Error(uploadData.error ?? "Échec de l'upload du logo");
        }
      }
      setBanks((prev) =>
        prev.map((b) => (b.id === editingBank.id ? { ...b, ...updated } : b)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingBank(null);
      setEditName("");
      setEditUrl("");
      setEditLogoFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setEditPending(false);
    }
  };

  const handleDelete = async (bank: Bank) => {
    if (!confirm(`Supprimer la banque « ${bank.name} » ?`)) return;
    setDeletingId(bank.id);
    setError(null);
    try {
      const res = await fetch(`/api/banks/${bank.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la suppression");
      }
      setBanks((prev) => prev.filter((b) => b.id !== bank.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setDeletingId(null);
    }
  };

  const openEdit = (bank: Bank) => {
    setEditingBank(bank);
    setEditName(bank.name);
    setEditUrl(bank.url ?? "");
    setEditLogoFile(null);
    setError(null);
  };

  if (loading) {
    return (
      <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="section-header mb-4 text-lg font-medium">Banques</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="section-header mb-4 text-lg font-medium">Banques</h2>
      <p className="mb-4 text-sm text-[var(--muted-foreground)]">
        Créez des banques et importez leurs logos. Lors de la création ou modification d&apos;un compte bancaire, vous pourrez associer une banque.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setBanksListExpanded((v) => !v)}
          className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-left text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
          aria-expanded={banksListExpanded}
        >
          {banksListExpanded ? (
            <ChevronDownIcon className="shrink-0 text-[var(--muted-foreground)]" />
          ) : (
            <ChevronRightIcon className="shrink-0 text-[var(--muted-foreground)]" />
          )}
          <span className="subsection-header">Liste des banques</span>
          <span className="text-[var(--muted-foreground)]">({banks.length})</span>
        </button>
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
        >
          Ajouter une banque
        </button>
      </div>

      {banksListExpanded && (
      <div className="max-h-[400px] overflow-auto">
        <div className="rounded-lg border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--primary-muted)]">
              <tr>
                <th className="table-header px-4 py-2 text-left font-medium">Logo</th>
                <th className="table-header px-4 py-2 text-left font-medium">Nom</th>
                <th className="table-header px-4 py-2 text-left font-medium">URL</th>
                <th className="table-header px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {banks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
                    Aucune banque
                  </td>
                </tr>
              ) : (
                banks.map((b) => (
                  <tr key={b.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-[var(--muted)]">
                        {b.has_logo ? (
                          <img
                            src={`/api/banks/${b.id}/files/logo`}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-[var(--foreground)]">{b.name}</td>
                    <td className="px-4 py-2">
                      {b.url ? (
                        <a
                          href={b.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--primary)] hover:underline truncate max-w-[200px] block"
                        >
                          {b.url}
                        </a>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(b)}
                          className="rounded px-2 py-1 text-sm text-[var(--primary)] hover:bg-[var(--primary-muted)]"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(b)}
                          disabled={deletingId === b.id}
                          className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          {deletingId === b.id ? "…" : "Supprimer"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCreateModalOpen(false)}>
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="subsection-header mb-4 text-lg font-medium">Ajouter une banque</h3>
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                {error}
              </div>
            )}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Ex. BNP Paribas"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">URL de la banque</label>
                <input
                  type="url"
                  value={createUrl}
                  onChange={(e) => setCreateUrl(e.target.value)}
                  placeholder="https://www.banque.fr"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Logo</label>
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] px-4 py-3 hover:border-[var(--primary)]">
                  <UploadIcon className="h-5 w-5 text-[var(--muted-foreground)]" />
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {createLogoFile ? createLogoFile.name : "Choisir un fichier"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setCreateLogoFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createPending || !createName.trim()}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {createPending ? "Création…" : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingBank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingBank(null)}>
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="subsection-header mb-4 text-lg font-medium">Modifier {editingBank.name}</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">URL de la banque</label>
                <input
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder="https://www.banque.fr"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Logo</label>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="h-16 w-16 overflow-hidden rounded border border-[var(--border)] bg-[var(--muted)]">
                    {editingBank.has_logo ? (
                      <img
                        src={`/api/banks/${editingBank.id}/files/logo?t=${Date.now()}`}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    ) : null}
                  </div>
                  <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] px-4 py-2 hover:border-[var(--primary)]">
                    <UploadIcon className="h-5 w-5 text-[var(--muted-foreground)]" />
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {editLogoFile ? editLogoFile.name : "Remplacer"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setEditLogoFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingBank(null)}
                className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleEdit}
                disabled={editPending || !editName.trim()}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
              >
                {editPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function AccountTypesSection() {
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPending, setCreatePending] = useState(false);
  const [editingType, setEditingType] = useState<AccountType | null>(null);
  const [editName, setEditName] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAccountTypes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account-types");
      if (!res.ok) throw new Error("Échec du chargement");
      const data = await res.json();
      setAccountTypes(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccountTypes();
  }, [fetchAccountTypes]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;
    setCreatePending(true);
    setError(null);
    try {
      const res = await fetch("/api/account-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sort_order: accountTypes.length }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la création");
      }
      const created = await res.json();
      setAccountTypes((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setCreateName("");
      setCreateModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setCreatePending(false);
    }
  };

  const handleEdit = async () => {
    if (!editingType) return;
    const name = editName.trim();
    if (!name) return;
    setEditPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/account-types/${editingType.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la mise à jour");
      }
      const updated = await res.json();
      setAccountTypes((prev) =>
        prev.map((t) => (t.id === editingType.id ? { ...t, ...updated } : t)).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      );
      setEditingType(null);
      setEditName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setEditPending(false);
    }
  };

  const handleDelete = async (t: AccountType) => {
    if (!confirm(`Supprimer le client « ${t.name} » ? Les comptes utilisant ce client n'en auront plus.`)) return;
    setDeletingId(t.id);
    setError(null);
    try {
      const res = await fetch(`/api/account-types/${t.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la suppression");
      }
      setAccountTypes((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="section-header mb-4 text-lg font-medium">Clients</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="section-header mb-4 text-lg font-medium">Clients</h2>
      <p className="mb-4 text-sm text-[var(--muted-foreground)]">
        Créez des clients (ex. Compte courant, Épargne, Professionnel). Lors de la création ou modification d&apos;un compte bancaire, vous pourrez sélectionner un client.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h3 className="subsection-header text-sm font-medium">Types existants</h3>
        <button
          type="button"
          onClick={() => { setCreateModalOpen(true); setCreateName(""); setError(null); }}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
        >
          Ajouter un client
        </button>
      </div>

      <div>
        <div className="rounded-lg border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--primary-muted)]">
              <tr>
                <th className="table-header px-4 py-2 text-left font-medium">Nom</th>
                <th className="table-header px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accountTypes.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
                    Aucun client. Créez-en un pour que les comptes puissent en avoir un.
                  </td>
                </tr>
              ) : (
                accountTypes.map((t) => (
                  <tr key={t.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 text-[var(--foreground)]">{t.name}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setEditingType(t); setEditName(t.name); setError(null); }}
                          className="rounded px-2 py-1 text-sm text-[var(--primary)] hover:bg-[var(--primary-muted)]"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(t)}
                          disabled={deletingId === t.id}
                          className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          {deletingId === t.id ? "…" : "Supprimer"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCreateModalOpen(false)}>
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="subsection-header mb-4 text-lg font-medium">Ajouter un client</h3>
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                {error}
              </div>
            )}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
                <AccountNameField
                  value={createName}
                  onChange={setCreateName}
                  placeholder="Ex. Compte courant"
                  autoFocus
                />
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createPending || !createName.trim()}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {createPending ? "Création…" : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingType(null)}>
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="subsection-header mb-4 text-lg font-medium">Modifier {editingType.name}</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
                <AccountNameField
                  value={editName}
                  onChange={setEditName}
                  placeholder="Ex. Compte courant"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingType(null)}
                className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleEdit}
                disabled={editPending || !editName.trim()}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
              >
                {editPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function AccountStatusesSection() {
  const [accountStatuses, setAccountStatuses] = useState<AccountStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createColor, setCreateColor] = useState<string | null>(null);
  const [createOpacity, setCreateOpacity] = useState<number | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [editingStatus, setEditingStatus] = useState<AccountStatus | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string | null>(null);
  const [editOpacity, setEditOpacity] = useState<number | null>(null);
  const [editPending, setEditPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  const fetchAccountStatuses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account-statuses");
      if (!res.ok) throw new Error("Échec du chargement");
      const data = await res.json();
      setAccountStatuses(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccountStatuses();
  }, [fetchAccountStatuses]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;
    setCreatePending(true);
    setError(null);
    try {
      const body: { name: string; sort_order: number; background_color?: string | null; background_opacity?: number | null } = {
        name,
        sort_order: accountStatuses.length,
      };
      if (createColor && /^#[0-9A-Fa-f]{6}$/.test(createColor)) body.background_color = createColor;
      if (createOpacity != null && createOpacity >= 0 && createOpacity <= 1) body.background_opacity = createOpacity;
      const res = await fetch("/api/account-statuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la création");
      }
      const created = await res.json();
      setAccountStatuses((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setCreateName("");
      setCreateColor(null);
      setCreateOpacity(null);
      setCreateModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setCreatePending(false);
    }
  };

  const handleEdit = async () => {
    if (!editingStatus) return;
    const name = editName.trim();
    if (!name) return;
    setEditPending(true);
    setError(null);
    try {
      const body: { name: string; background_color?: string | null; background_opacity?: number | null } = { name };
      body.background_color = editColor && /^#[0-9A-Fa-f]{6}$/.test(editColor) ? editColor : null;
      body.background_opacity = editOpacity != null && editOpacity >= 0 && editOpacity <= 1 ? editOpacity : null;
      const res = await fetch(`/api/account-statuses/${editingStatus.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la mise à jour");
      }
      const updated = await res.json();
      setAccountStatuses((prev) =>
        prev.map((s) => (s.id === editingStatus.id ? { ...s, ...updated } : s)).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      );
      setEditingStatus(null);
      setEditName("");
      setEditColor(null);
      setEditOpacity(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setEditPending(false);
    }
  };

  const handleSetDefault = async (s: AccountStatus) => {
    if (s.is_default) return;
    setSettingDefaultId(s.id);
    setError(null);
    try {
      const res = await fetch(`/api/account-statuses/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la mise à jour");
      }
      const updated = await res.json();
      setAccountStatuses((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, is_default: true } : { ...x, is_default: false }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSettingDefaultId(null);
    }
  };

  const handleDelete = async (s: AccountStatus) => {
    if (!confirm(`Supprimer le statut « ${s.name} » ? Les comptes utilisant ce statut devront en avoir un autre.`)) return;
    setDeletingId(s.id);
    setError(null);
    try {
      const res = await fetch(`/api/account-statuses/${s.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la suppression");
      }
      setAccountStatuses((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="section-header mb-4 text-lg font-medium">Statuts de comptes</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="section-header mb-4 text-lg font-medium">Statuts de comptes</h2>
      <p className="mb-4 text-sm text-[var(--muted-foreground)]">
        Créez des statuts de comptes (ex. Ouvert, Fermé, Problème). Lors de la création ou modification d&apos;un compte bancaire, vous pourrez sélectionner un statut.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h3 className="subsection-header text-sm font-medium">Statuts existants</h3>
        <button
          type="button"
          onClick={() => { setCreateModalOpen(true); setCreateName(""); setCreateColor(null); setCreateOpacity(null); setError(null); }}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
        >
          Ajouter un statut
        </button>
      </div>

      <div>
        <div className="rounded-lg border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--primary-muted)]">
              <tr>
                <th className="table-header px-4 py-2 text-left font-medium">Nom</th>
                <th className="table-header px-4 py-2 text-center font-medium w-10" title="Par défaut">★</th>
                <th className="table-header px-4 py-2 text-center font-medium w-16">Fond</th>
                <th className="table-header px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accountStatuses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
                    Aucun statut de compte. Créez-en un pour que les comptes puissent en avoir un.
                  </td>
                </tr>
              ) : (
                accountStatuses.map((s) => (
                  <tr key={s.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 text-[var(--foreground)]">{s.name}</td>
                    <td className="px-4 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleSetDefault(s)}
                        disabled={s.is_default || settingDefaultId === s.id}
                        title={s.is_default ? "Statut par défaut" : "Définir comme statut par défaut"}
                        className="rounded p-1 text-amber-500 hover:bg-amber-50 disabled:opacity-50 disabled:hover:bg-transparent dark:hover:bg-amber-950"
                      >
                        <StarIcon filled={!!s.is_default} className="text-amber-500" />
                      </button>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {s.background_color ? (
                        (() => {
                          const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(s.background_color);
                          if (!m) return <span className="text-[var(--muted-foreground)]">—</span>;
                          const opacity = s.background_opacity != null ? s.background_opacity : 0.25;
                          return (
                            <span
                              className="inline-block h-6 w-8 rounded border border-[var(--border)]"
                              style={{
                                backgroundColor: `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${opacity})`,
                              }}
                              title={`${s.background_color}${s.background_opacity != null ? ` ${Math.round(s.background_opacity * 100)}%` : ""}`}
                            />
                          );
                        })()
                      ) : (
                        <span className="text-[var(--muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setEditingStatus(s); setEditName(s.name); setEditColor(s.background_color ?? null); setEditOpacity(s.background_opacity ?? null); setError(null); }}
                          className="rounded px-2 py-1 text-sm text-[var(--primary)] hover:bg-[var(--primary-muted)]"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(s)}
                          disabled={deletingId === s.id}
                          className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          {deletingId === s.id ? "…" : "Supprimer"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCreateModalOpen(false)}>
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="subsection-header mb-4 text-lg font-medium">Ajouter un statut de compte</h3>
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                {error}
              </div>
            )}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
                <AccountNameField
                  value={createName}
                  onChange={setCreateName}
                  placeholder="Ex. Ouvert"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Couleur de fond (carte compte)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={createColor ?? "#94a3b8"}
                    onChange={(e) => setCreateColor(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded border border-[var(--border)] bg-transparent"
                  />
                  <input
                    type="text"
                    value={createColor ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setCreateColor(v || null);
                    }}
                    placeholder="#hex (optionnel)"
                    className="flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setCreateColor(null)}
                    className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  >
                    Aucune
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Opacité (0–100 %, optionnel)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={createOpacity != null ? Math.round(createOpacity * 100) : 50}
                    onChange={(e) => setCreateOpacity(parseInt(e.target.value, 10) / 100)}
                    className="flex-1"
                  />
                  <span className="w-10 text-right text-sm text-[var(--muted-foreground)]">
                    {createOpacity != null ? Math.round(createOpacity * 100) : "—"}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setCreateOpacity(null)}
                    className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  >
                    Aucune
                  </button>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createPending || !createName.trim()}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {createPending ? "Création…" : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingStatus(null)}>
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="subsection-header mb-4 text-lg font-medium">Modifier {editingStatus.name}</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
                <AccountNameField
                  value={editName}
                  onChange={setEditName}
                  placeholder="Ex. Ouvert"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Couleur de fond (carte compte)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editColor ?? "#94a3b8"}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded border border-[var(--border)] bg-transparent"
                  />
                  <input
                    type="text"
                    value={editColor ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setEditColor(v || null);
                    }}
                    placeholder="#hex (optionnel)"
                    className="flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setEditColor(null)}
                    className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  >
                    Aucune
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Opacité (0–100 %, optionnel)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={editOpacity != null ? Math.round(editOpacity * 100) : 50}
                    onChange={(e) => setEditOpacity(parseInt(e.target.value, 10) / 100)}
                    className="flex-1"
                  />
                  <span className="w-10 text-right text-sm text-[var(--muted-foreground)]">
                    {editOpacity != null ? Math.round(editOpacity * 100) : "—"}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditOpacity(null)}
                    className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  >
                    Aucune
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingStatus(null)}
                className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleEdit}
                disabled={editPending || !editName.trim()}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
              >
                {editPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SourcesSection() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPending, setCreatePending] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [editName, setEditName] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sources");
      if (!res.ok) throw new Error("Échec du chargement");
      const data = await res.json();
      setSources(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;
    setCreatePending(true);
    setError(null);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sort_order: sources.length }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la création");
      }
      const created = await res.json();
      setSources((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setCreateName("");
      setCreateModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setCreatePending(false);
    }
  };

  const handleEdit = async () => {
    if (!editingSource) return;
    const name = editName.trim();
    if (!name) return;
    setEditPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/sources/${editingSource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la mise à jour");
      }
      const updated = await res.json();
      setSources((prev) =>
        prev.map((s) => (s.id === editingSource.id ? { ...s, ...updated } : s)).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      );
      setEditingSource(null);
      setEditName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setEditPending(false);
    }
  };

  const handleDelete = async (s: Source) => {
    if (!confirm(`Supprimer la source « ${s.name} » ?`)) return;
    setDeletingId(s.id);
    setError(null);
    try {
      const res = await fetch(`/api/sources/${s.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la suppression");
      }
      setSources((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="section-header mb-4 text-lg font-medium">Sources</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="section-header mb-4 text-lg font-medium">Sources</h2>
      <p className="mb-4 text-sm text-[var(--muted-foreground)]">
        Créez des sources (ex. Banque locale, Mobile).
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h3 className="subsection-header text-sm font-medium">Sources existantes</h3>
        <button
          type="button"
          onClick={() => { setCreateModalOpen(true); setCreateName(""); setError(null); }}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
        >
          Ajouter une source
        </button>
      </div>

      <div>
        <div className="rounded-lg border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--primary-muted)]">
              <tr>
                <th className="table-header px-4 py-2 text-left font-medium">Nom</th>
                <th className="table-header px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
                    Aucune source. Créez-en une pour commencer.
                  </td>
                </tr>
              ) : (
                sources.map((s) => (
                  <tr key={s.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 text-[var(--foreground)]">{s.name}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setEditingSource(s); setEditName(s.name); setError(null); }}
                          className="rounded px-2 py-1 text-sm text-[var(--primary)] hover:bg-[var(--primary-muted)]"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(s)}
                          disabled={deletingId === s.id}
                          className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          {deletingId === s.id ? "…" : "Supprimer"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCreateModalOpen(false)}>
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="subsection-header mb-4 text-lg font-medium">Ajouter une source</h3>
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                {error}
              </div>
            )}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Ex. Banque locale"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createPending || !createName.trim()}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {createPending ? "Création…" : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingSource(null)}>
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="subsection-header mb-4 text-lg font-medium">Modifier {editingSource.name}</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ex. Banque locale"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingSource(null)}
                className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleEdit}
                disabled={editPending || !editName.trim()}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
              >
                {editPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const DEFAULT_TEMPLATE_CONTENT = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Facture {{invoice.number}}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 0; }
    .invoice-header { display: flex; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #2c3e50; }
    .invoice-title { font-size: 24px; font-weight: 700; color: #2c3e50; margin: 0; }
    .addresses { display: flex; justify-content: space-between; gap: 40px; margin-bottom: 24px; }
    table.line-items { width: 100%; border-collapse: collapse; }
    table.line-items th, table.line-items td { padding: 10px 12px; text-align: left; }
    table.line-items th.text-right, table.line-items td.text-right { text-align: right; }
    .totals { margin-left: auto; width: 280px; margin-top: 24px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; }
  </style>
</head>
<body>
  <header class="invoice-header">
    <h1 class="invoice-title">Facture {{invoice.number}}</h1>
    <div><strong>Date d'émission</strong> {{formatDate invoice.issueDate}}<br><strong>Échéance</strong> {{formatDate invoice.dueDate}}</div>
  </header>
  <div class="addresses">
    <div><h3>Émetteur</h3><div>{{company.name}}</div>{{#if company.address}}<p>{{company.address}}</p>{{/if}}{{#if company.siret}}<p>SIRET : {{company.siret}}</p>{{/if}}</div>
    <div><h3>Client</h3><div>{{customer.name}}</div>{{#if customer.address}}<p>{{customer.address}}</p>{{/if}}</div>
  </div>
  <table class="line-items">
    <thead><tr><th>Description</th><th class="text-right">Qté</th><th class="text-right">Prix unit.</th><th class="text-right">{{countryRules.vatLabel}}</th><th class="text-right">Montant</th></tr></thead>
    <tbody>{{#each lineItems}}<tr><td>{{this.description}}</td><td class="text-right">{{this.quantity}}</td><td class="text-right">{{formatNumber this.unit_price}} {{../invoice.currency}}</td><td class="text-right">{{this.vat_rate}}%</td><td class="text-right">{{formatNumber this.amount}} {{../invoice.currency}}</td></tr>{{/each}}</tbody>
  </table>
  <div class="totals">
    <div class="totals-row"><span>Sous-total HT</span><span>{{formatNumber invoice.subtotal}} {{invoice.currency}}</span></div>
    <div class="totals-row"><span>{{countryRules.vatLabel}}</span><span>{{formatNumber invoice.taxAmount}} {{invoice.currency}}</span></div>
    <div class="totals-row"><span>Total TTC</span><span>{{formatNumber invoice.total}} {{invoice.currency}}</span></div>
  </div>
</body>
</html>`;

function TemplatesSection() {
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCountry, setCreateCountry] = useState("FR");
  const [createContent, setCreateContent] = useState(DEFAULT_TEMPLATE_CONTENT);
  const [createPending, setCreatePending] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<InvoiceTemplate | null>(null);
  const [editName, setEditName] = useState("");
  const [editCountry, setEditCountry] = useState("FR");
  const [editContent, setEditContent] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/templates");
      if (!res.ok) throw new Error("Échec du chargement");
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;
    setCreatePending(true);
    setError(null);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          country_code: createCountry,
          template_content: createContent,
          is_default: templates.length === 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la création");
      }
      const created = await res.json();
      setTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCreateName("");
      setCreateCountry("FR");
      setCreateContent(DEFAULT_TEMPLATE_CONTENT);
      setCreateModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setCreatePending(false);
    }
  };

  const handleEdit = async () => {
    if (!editingTemplate) return;
    const name = editName.trim();
    if (!name) return;
    setEditPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${editingTemplate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          country_code: editCountry,
          template_content: editContent,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la mise à jour");
      }
      const updated = await res.json();
      setTemplates((prev) =>
        prev.map((t) => (t.id === editingTemplate.id ? { ...t, ...updated } : t)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingTemplate(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setEditPending(false);
    }
  };

  const handleDelete = async (t: InvoiceTemplate) => {
    if (!confirm(`Supprimer le template « ${t.name } » ?`)) return;
    setDeletingId(t.id);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${t.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la suppression");
      }
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setDeletingId(null);
    }
  };

  const openCreate = () => {
    setCreateModalOpen(true);
    setCreateName("");
    setCreateCountry("FR");
    setCreateContent(DEFAULT_TEMPLATE_CONTENT);
    setError(null);
  };

  const openEdit = (t: InvoiceTemplate) => {
    setEditingTemplate(t);
    setEditName(t.name);
    setEditCountry(t.country_code);
    setEditContent(t.template_content);
    setError(null);
  };

  const handlePreview = async (templateContent: string, countryCode: string) => {
    setPreviewPending(true);
    setError(null);
    try {
      const res = await fetch("/api/templates/preview/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_content: templateContent,
          country_code: countryCode,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la prévisualisation");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setPreviewPending(false);
    }
  };

  if (loading) {
    return (
      <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="section-header mb-4 text-lg font-medium">Templates de facture</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="section-header mb-4 text-lg font-medium">Templates de facture</h2>
      <p className="mb-4 text-sm text-[var(--muted-foreground)]">
        Créez et gérez les templates de facture. Chaque société pourra choisir le template à utiliser dans sa page.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h3 className="subsection-header text-sm font-medium">Templates existants</h3>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
        >
          Créer un template
        </button>
      </div>

      <div className="rounded-lg border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--primary-muted)]">
            <tr>
              <th className="table-header px-4 py-2 text-left font-medium">Nom</th>
              <th className="table-header px-4 py-2 text-left font-medium">Pays</th>
              <th className="table-header px-4 py-2 text-left font-medium">Par défaut</th>
              <th className="table-header px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
                  Aucun template. Créez-en un pour que les sociétés puissent l&apos;utiliser.
                </td>
              </tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2 text-[var(--foreground)]">{t.name}</td>
                  <td className="px-4 py-2 text-[var(--foreground)]">{t.country_code}</td>
                  <td className="px-4 py-2">{t.is_default ? <span className="text-[var(--primary)]">Oui</span> : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handlePreview(t.template_content, t.country_code)}
                        disabled={previewPending}
                        className="rounded px-2 py-1 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                      >
                        {previewPending ? "…" : "Prévisualiser"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        className="rounded px-2 py-1 text-sm text-[var(--primary)] hover:bg-[var(--primary-muted)]"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(t)}
                        disabled={deletingId === t.id}
                        className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
                      >
                        {deletingId === t.id ? "…" : "Supprimer"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCreateModalOpen(false)}>
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="subsection-header mb-4 text-lg font-medium">Nouveau template</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Ex. Facture France"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Pays</label>
                <select value={createCountry} onChange={(e) => setCreateCountry(e.target.value)} className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
                  <option value="FR">France</option>
                  <option value="BE">Belgique</option>
                  <option value="CH">Suisse</option>
                  <option value="PT">Portugal</option>
                  <option value="ES">Espagne</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Contenu HTML (Handlebars)</label>
                <textarea value={createContent} onChange={(e) => setCreateContent(e.target.value)} className="font-mono text-sm w-full min-h-[300px] rounded-lg border border-[var(--border)] bg-[var(--background)] p-3" spellCheck={false} />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handlePreview(createContent, createCountry)}
                  disabled={previewPending || !createContent.trim()}
                  className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                >
                  {previewPending ? "…" : "Prévisualiser"}
                </button>
                <button type="button" onClick={() => setCreateModalOpen(false)} className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]">Annuler</button>
                <button type="submit" disabled={createPending || !createName.trim()} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50">{createPending ? "Création…" : "Créer"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingTemplate(null)}>
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="subsection-header mb-4 text-lg font-medium">Modifier {editingTemplate.name}</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Pays</label>
                <select value={editCountry} onChange={(e) => setEditCountry(e.target.value)} className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
                  <option value="FR">France</option>
                  <option value="BE">Belgique</option>
                  <option value="CH">Suisse</option>
                  <option value="PT">Portugal</option>
                  <option value="ES">Espagne</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Contenu HTML (Handlebars)</label>
                <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="font-mono text-sm w-full min-h-[300px] rounded-lg border border-[var(--border)] bg-[var(--background)] p-3" spellCheck={false} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => handlePreview(editContent, editCountry)}
                disabled={previewPending || !editContent.trim()}
                className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
              >
                {previewPending ? "…" : "Prévisualiser"}
              </button>
              <button type="button" onClick={() => setEditingTemplate(null)} className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]">Annuler</button>
              <button type="button" onClick={handleEdit} disabled={editPending || !editName.trim()} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50">{editPending ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}

export default function SettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const loadUsers = useCallback(async () => {
    const session = await getCachedSession();
    const role = session?.user?.role;
    setIsAdmin(role === "admin");
    setCurrentUserId(session?.user?.id ?? null);

    if (role === "admin") {
      const { data } = await authClient.admin.listUsers({
        query: { limit: 50, sortBy: "createdAt", sortDirection: "desc" },
      });
      const userList = (data?.users ?? []) as User[];
      const linksRes = await fetch("/api/admin/users/telegram-links");
      if (linksRes.ok) {
        const { links } = await linksRes.json();
        const byUserId = new Map((links as { user_id: string; telegram_id: number; telegram_username?: string }[]).map((l) => [l.user_id, l]));
        const merged = userList.map((u) => {
          const link = byUserId.get(u.id);
          return link ? { ...u, telegram_id: link.telegram_id, telegram_username: link.telegram_username } : u;
        });
        setUsers(merged);
      } else {
        setUsers(userList);
      }
    }
    setUsersLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleDelete = async (user: User) => {
    if (!confirm(`Supprimer l'utilisateur "${user.name}" (${user.email}) ? Cette action est irréversible.`)) return;
    setActionError(null);
    const { error } = await authClient.admin.removeUser({ userId: user.id });
    if (error) {
      setActionError(error.message ?? "Échec de la suppression.");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
  };

  const handleSetRole = async (userId: string, role: "user" | "admin") => {
    setActionError(null);
    const { error } = await authClient.admin.setRole({ userId, role });
    if (error) {
      setActionError(error.message ?? "Échec de la modification du rôle.");
      return;
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role } : u))
    );
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setActionError(null);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setActionError(null);
    const { error } = await authClient.admin.updateUser({
      userId: editingUser.id,
      data: { name: editName.trim(), email: editEmail.trim() },
    });
    if (error) {
      setActionError(error.message ?? "Échec de la mise à jour.");
      return;
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.id === editingUser.id
          ? { ...u, name: editName.trim(), email: editEmail.trim() }
          : u
      )
    );
    setEditingUser(null);
  };

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateError(null);
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement)?.value?.trim();
    const email = (form.elements.namedItem("email") as HTMLInputElement)?.value?.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement)?.value?.trim();

    if (!name || !email || !password) {
      setCreateError("Tous les champs sont requis.");
      return;
    }
    if (password.length < 8) {
      setCreateError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    setCreatePending(true);
    const { data, error } = await authClient.admin.createUser({
      email,
      password,
      name,
      role: "user",
    });
    setCreatePending(false);

    if (error) {
      setCreateError(error.message ?? "Échec de la création du compte.");
      return;
    }
    if (data?.user) {
      setUsers((prev) => [{ ...data.user, role: "user" }, ...prev]);
      form.reset();
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-auto p-6">
        <h1 className="page-title mb-6 text-2xl font-semibold">
          Paramètres
        </h1>

        {/* Section Utilisateurs - visible uniquement aux admins */}
        {!usersLoading && isAdmin && (
          <section className="mb-8">
            <h2 className="section-header mb-4 text-lg font-medium">
              Utilisateurs
            </h2>
            <p className="mb-4 text-sm text-[var(--muted-foreground)]">
              Créez des comptes pour les utilisateurs. Les nouveaux comptes ne
              peuvent être créés que depuis cette page par un administrateur.
            </p>

            <form
              onSubmit={handleCreateUser}
              className="mb-8 flex flex-wrap gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div className="flex-1 min-w-[200px]">
                <label
                  htmlFor="name"
                  className="mb-1 block text-sm font-medium text-[var(--foreground)]"
                >
                  Nom
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  placeholder="Jean Dupont"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label
                  htmlFor="email"
                  className="mb-1 block text-sm font-medium text-[var(--foreground)]"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="jean@exemple.com"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label
                  htmlFor="password"
                  className="mb-1 block text-sm font-medium text-[var(--foreground)]"
                >
                  Mot de passe
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={createPending}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {createPending ? "Création..." : "Créer le compte"}
                </button>
              </div>
            </form>

            {(createError || actionError) && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                {createError ?? actionError}
              </div>
            )}

            <div>
              <h3 className="subsection-header mb-2 text-sm font-medium">
                Utilisateurs existants
              </h3>
              <div className="rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--card)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--primary-muted)]">
                    <tr>
                      <th className="table-header px-4 py-2 text-left font-medium">
                        Nom
                      </th>
                      <th className="table-header px-4 py-2 text-left font-medium">
                        Email
                      </th>
                      <th className="table-header px-4 py-2 text-left font-medium">
                        Rôle
                      </th>
                      <th className="table-header px-4 py-2 text-left font-medium">
                        Telegram
                      </th>
                      <th className="table-header px-4 py-2 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-[var(--card)]">
                    {users.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-6 text-center text-[var(--muted-foreground)]"
                        >
                          Aucun utilisateur
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <UserRow
                          key={u.id}
                          user={u}
                          currentUserId={currentUserId}
                          onDelete={handleDelete}
                          onSetRole={handleSetRole}
                          onEdit={openEdit}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {editingUser && (
              <EditUserModal
                user={editingUser}
                name={editName}
                email={editEmail}
                onNameChange={setEditName}
                onEmailChange={setEditEmail}
                onSave={handleUpdateUser}
                onClose={() => setEditingUser(null)}
              />
            )}
          </section>
        )}

        {!usersLoading && !isAdmin && (
          <p className="text-[var(--muted-foreground)]">
            La gestion des utilisateurs est réservée aux administrateurs.
          </p>
        )}

        {usersLoading && (
          <p className="text-[var(--muted-foreground)]">Chargement...</p>
        )}

        {/* Mon Telegram - visible à tous les utilisateurs */}
        {!usersLoading && <UserTelegramLinkSection />}

        {/* Section Banques - visible aux admins */}
        {!usersLoading && isAdmin && <BanksSection />}

        {/* Section Clients - visible aux admins */}
        {!usersLoading && isAdmin && <AccountTypesSection />}

        {/* Section Statuts de comptes - visible aux admins */}
        {!usersLoading && isAdmin && <AccountStatusesSection />}

        {/* Section Sources - visible aux admins */}
        {!usersLoading && isAdmin && <SourcesSection />}

        {/* Section Connexion Telegram (session MTProto) - visible aux admins */}
        {!usersLoading && isAdmin && (
          <TelegramConnectionSection />
        )}

        {/* Section Templates de facture - visible aux admins */}
        {!usersLoading && isAdmin && <TemplatesSection />}
      </main>
    </div>
  );
}
