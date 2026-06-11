"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountNameField } from "@/components/AccountNameField";
import { Select } from "@/components/Select";
import { modalBackdropClose, suppressNextModalBackdropClose } from "@/lib/modal-backdrop-close";

const EMOJI_OPTIONS = [
  { value: "", label: "Aucun" },
  { value: "❄️", label: "Neige" },
  { value: "🏠", label: "Maison" },
  { value: "🔴", label: "Point rouge" },
  { value: "🟢", label: "Point vert" },
  { value: "🏢", label: "Immeuble" },
  { value: "🐬", label: "Dauphin" },
  { value: "🧿", label: "Nazar" },
  { value: "🚫", label: "Stop" },
  { value: "⚠️", label: "Danger" },
  { value: "🛑", label: "Hexagone rouge" },
] as const;
import { authClient } from "@/lib/auth/client";
import { getCachedSession } from "@/lib/auth/session-cache";
import { canMutate, type AppRole } from "@/lib/auth/permissions";
import type { AccountStatus, AccountType, Bank, Fournisseur, InvoiceTemplate, Source } from "@/lib/types";

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
  isSuperAdmin,
  superAdminPending,
  onToggleSuperAdmin,
}: {
  user: User;
  currentUserId: string | null;
  onDelete: (u: User) => void;
  onSetRole: (userId: string, role: AppRole) => void;
  onEdit: (u: User) => void;
  isSuperAdmin: boolean;
  superAdminPending: boolean;
  onToggleSuperAdmin: (userId: string, enabled: boolean) => void;
}) {
  const isSelf = user.id === currentUserId;
  return (
    <tr className="border-t border-[var(--border)]">
      <td className="px-4 py-2 text-[var(--foreground)]">{user.name}</td>
      <td className="px-4 py-2 text-[var(--foreground)]">{user.email}</td>
      <td className="px-4 py-2">
        <select
          value={user.role ?? "user"}
          onChange={(e) => onSetRole(user.id, e.target.value as AppRole)}
          disabled={isSelf}
          className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm disabled:opacity-50"
          title={isSelf ? "Vous ne pouvez pas modifier votre propre rôle" : undefined}
        >
          <option value="user">Utilisateur</option>
          <option value="lecteur">Lecteur</option>
          <option value="admin">Administrateur</option>
        </select>
      </td>
      <td className="px-4 py-2 text-center">
        <input
          type="checkbox"
          checked={isSuperAdmin}
          disabled={superAdminPending || (isSelf && isSuperAdmin)}
          onChange={(e) => onToggleSuperAdmin(user.id, e.target.checked)}
          title={
            isSelf && isSuperAdmin
              ? "Seul un autre super-admin peut retirer votre accès (Paramètres)."
              : "Accès à la page Rapports et statistiques globales"
          }
          className="h-4 w-4 accent-[var(--primary)] disabled:opacity-50"
          aria-label={`Super-admin pour ${user.name}`}
        />
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
  currentUserId,
  name,
  email,
  newPassword,
  confirmPassword,
  onNameChange,
  onEmailChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onSave,
  onClose,
  savePending,
}: {
  user: User;
  currentUserId: string | null;
  name: string;
  email: string;
  newPassword: string;
  confirmPassword: string;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onNewPasswordChange: (v: string) => void;
  onConfirmPasswordChange: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
  savePending: boolean;
}) {
  const isOtherUser = user.id !== currentUserId;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => modalBackdropClose(e, onClose)}
    >
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
          {isOtherUser && (
            <>
              <div className="border-t border-[var(--border)] pt-4">
                <p className="mb-3 text-xs text-[var(--muted-foreground)]">
                  Définir un nouveau mot de passe pour ce compte (laisser vide pour ne pas modifier).
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                      Nouveau mot de passe
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => onNewPasswordChange(e.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      placeholder="••••••••"
                      className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                      Confirmer le mot de passe
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => onConfirmPasswordChange(e.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      placeholder="••••••••"
                      className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={savePending}
            className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={savePending}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
          >
            {savePending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

type TelegramStatus = {
  authorized: boolean;
  user?: {
    id?: number;
    first_name: string;
    username: string;
    phone?: string;
  };
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

  const handleLogoutSession = async () => {
    if (
      !confirm(
        "Déconnecter le compte Telegram utilisé par le serveur pour créer les groupes ? Vous pourrez ensuite vous connecter avec un autre numéro."
      )
    )
      return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram-auth/logout", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setStatus({ authorized: false });
        setStep("phone");
        setPhone("");
        setCode("");
        setPassword("");
      } else {
        setError(typeof data.error === "string" ? data.error : "Échec de la déconnexion");
      }
    } catch {
      setError("Service inaccessible");
    } finally {
      setPending(false);
    }
  };

  if (loading) {
    return (
      <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="section-header mb-4 text-lg font-medium">
          Session Telegram (création de groupes)
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="section-header mb-4 text-lg font-medium">
        Session Telegram (création de groupes)
      </h2>
      <p className="mb-4 text-sm text-[var(--muted-foreground)]">
        Compte Telegram utilisé <strong>par le serveur</strong> pour créer les supergroupes lors de l&apos;ajout de comptes bancaires. À ne pas confondre avec « Mon Telegram » : chaque utilisateur doit lier son propre compte pour être invité dans ces groupes.
      </p>

      {status?.error && !status.authorized && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {status.error}
        </div>
      )}

      {status?.authorized && status.user ? (
        <div className="flex flex-col gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-green-800 dark:bg-green-950">
          <span className="min-w-0 flex-1 break-words text-sm text-green-800 dark:text-green-200">
            Connecté en tant que <strong>{status.user.first_name}</strong>
            {status.user.username ? ` (@${status.user.username})` : ""}
            {status.user.phone ? (
              <span className="mt-1 block text-xs opacity-90">
                Numéro côté serveur : <code className="font-mono">{status.user.phone}</code>
              </span>
            ) : null}
            {typeof status.user.id === "number" ? (
              <span className="mt-1 block text-xs opacity-90">
                ID Telegram (serveur) : <code className="font-mono">{status.user.id}</code>
              </span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={handleLogoutSession}
            disabled={pending}
            className="shrink-0 rounded-lg border border-green-300 bg-white px-3 py-1.5 text-sm font-medium text-green-900 hover:bg-green-100 disabled:opacity-50 dark:border-green-700 dark:bg-green-900 dark:text-green-100 dark:hover:bg-green-800"
          >
            {pending ? "…" : "Changer de compte"}
          </button>
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

      {status?.authorized && typeof status.user?.id === "number" ? (
        <p className="mt-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
          <span className="font-medium text-[var(--foreground)]">
            Vérifier que c’est bien le même compte que sur votre téléphone :
          </span>{" "}
          sous <strong>Paramètres → Appareils</strong> (sessions actives), le compte doit lister, en plus du
          téléphone, une session correspondant au serveur (souvent un autre appareil ou un client comme Telethon).
          Le <strong>numéro</strong> dans Paramètres doit matcher « Numéro côté serveur » s’il est affiché. Pour
          l’<strong>ID numérique</strong>, comparez avec une méthode de confiance (par ex. bot d’info où vous
          n’envoyez qu’un message de ce compte) : il doit être identique à l’ID affiché ci-dessus.
        </p>
      ) : null}
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
  const [createBic, setCreateBic] = useState("");
  const [createLogoFile, setCreateLogoFile] = useState<File | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editBic, setEditBic] = useState("");
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
        body: JSON.stringify({ name, url: createUrl.trim() || null, bic: createBic.trim() || null }),
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
      setCreateBic("");
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
    setCreateBic("");
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
        body: JSON.stringify({ name, url: editUrl.trim() || null, bic: editBic.trim() || null }),
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
      setEditBic("");
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
    setEditBic(bank.bic ?? "");
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
                <th className="table-header px-4 py-2 text-left font-medium">BIC / SWIFT</th>
                <th className="table-header px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {banks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
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
                    <td className="px-4 py-2 text-[var(--foreground)] font-mono text-xs">
                      {b.bic ?? "—"}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => modalBackdropClose(e, () => setCreateModalOpen(false))}
        >
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
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">BIC / SWIFT</label>
                <input
                  type="text"
                  value={createBic}
                  onChange={(e) => setCreateBic(e.target.value.toUpperCase())}
                  placeholder="Ex. BNPAFRPP"
                  maxLength={11}
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono uppercase"
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => modalBackdropClose(e, () => setEditingBank(null))}
        >
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
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">BIC / SWIFT</label>
                <input
                  type="text"
                  value={editBic}
                  onChange={(e) => setEditBic(e.target.value.toUpperCase())}
                  placeholder="Ex. BNPAFRPP"
                  maxLength={11}
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono uppercase"
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

type BackupListItem = { key: string; size: number; last_modified: string | null; parts?: number };

function isBackupListItem(value: unknown): value is BackupListItem {
  if (!value || typeof value !== "object") return false;
  const v = value as { key?: unknown; size?: unknown; last_modified?: unknown; parts?: unknown };
  return (
    typeof v.key === "string" &&
    typeof v.size === "number" &&
    (typeof v.last_modified === "string" || v.last_modified === null) &&
    (v.parts === undefined || typeof v.parts === "number")
  );
}

function databaseBackupResponseError(data: unknown, fallback: string, status: number): string {
  if (!data || typeof data !== "object") return status >= 400 ? `Erreur ${status}` : fallback;
  const e = (data as { error?: unknown }).error;
  if (typeof e === "string" && e.trim()) return e;
  if (e && typeof e === "object") {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return status >= 400 ? `Erreur ${status}` : fallback;
}

function DatabaseBackupSection() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [cloudName, setCloudName] = useState<string | null>(null);
  const [backupFolder, setBackupFolder] = useState<string | null>(null);
  const [recent, setRecent] = useState<BackupListItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [backupPending, setBackupPending] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/database-backup");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(databaseBackupResponseError(data, "Échec du chargement", res.status));
      }
      setConfigured(!!data.configured);
      setCloudName(typeof data.cloud_name === "string" ? data.cloud_name : null);
      setBackupFolder(typeof data.folder === "string" ? data.folder : null);
      const nextRecent: BackupListItem[] = Array.isArray(data.recent)
        ? data.recent.filter(isBackupListItem)
        : [];
      setRecent(nextRecent);
      setSelectedKeys((prev) => {
        const visible = new Set(nextRecent.map((r) => r.key));
        return prev.filter((k) => visible.has(k));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setConfigured(false);
      setRecent([]);
      setSelectedKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSnapshot = async () => {
    if (!confirm("Lancer une sauvegarde manuelle vers Cloudinary ? Cela peut prendre plusieurs minutes.")) return;
    setBackupPending(true);
    setError(null);
    setLastMessage(null);
    try {
      const res = await fetch("/api/admin/database-backup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(databaseBackupResponseError(data, "Échec de la sauvegarde", res.status));
      }
      const n =
        typeof data.part_count === "number" && data.part_count > 0 ? data.part_count : null;
      setLastMessage(
        n != null
          ? `Instantané créé : ${data.key} (${n} segment(s) gzip + manifest)`
          : `Instantané créé : ${data.key}`,
      );
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBackupPending(false);
    }
  };

  const handleDeleteSnapshot = async (key: string) => {
    if (!confirm(`Supprimer cet instantané Cloudinary ?\n\n${key}\n\nCette action est irréversible.`)) return;
    setDeletingKey(key);
    setError(null);
    setLastMessage(null);
    try {
      const res = await fetch("/api/admin/database-backup", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(databaseBackupResponseError(data, "Échec de la suppression", res.status));
      }
      const deletedCount =
        typeof data.deleted_count === "number" && data.deleted_count >= 0 ? data.deleted_count : null;
      setLastMessage(
        deletedCount != null
          ? `Instantané supprimé : ${key} (${deletedCount} fichier(s) supprimé(s))`
          : `Instantané supprimé : ${key}`,
      );
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setDeletingKey(null);
    }
  };

  const toggleSelectSnapshot = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const toggleSelectAllSnapshots = () => {
    setSelectedKeys((prev) => (prev.length === recent.length ? [] : recent.map((r) => r.key)));
  };

  const handleDeleteSelectedSnapshots = async () => {
    if (selectedKeys.length === 0) return;
    if (
      !confirm(
        `Supprimer ${selectedKeys.length} instantané(s) Cloudinary ?\n\nCette action est irréversible.`
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    setError(null);
    setLastMessage(null);
    try {
      const keys = [...selectedKeys];
      const res = await fetch("/api/admin/database-backup", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
      });
      const data = await res.json();
      const succeededKeys = Array.isArray(data?.succeeded_keys)
        ? data.succeeded_keys.filter((k: unknown): k is string => typeof k === "string")
        : [];
      const failedKeys = Array.isArray(data?.failed_keys)
        ? data.failed_keys.filter((k: unknown): k is string => typeof k === "string")
        : [];
      if (!res.ok) {
        throw new Error(databaseBackupResponseError(data, "Échec de la suppression en lot", res.status));
      }
      const deletedCount =
        typeof data.deleted_count === "number" && data.deleted_count >= 0 ? data.deleted_count : null;
      const succeededCount = succeededKeys.length;
      const failedCount = failedKeys.length;
      setLastMessage(
        deletedCount != null
          ? failedCount > 0
            ? `Suppression partielle : ${succeededCount} instantané(s) supprimé(s), ${failedCount} en échec (${deletedCount} fichier(s) supprimé(s))`
            : `Suppression terminée : ${succeededCount} instantané(s), ${deletedCount} fichier(s) supprimé(s)`
          : failedCount > 0
            ? `Suppression partielle : ${succeededCount} instantané(s) supprimé(s), ${failedCount} en échec`
            : `Suppression terminée : ${succeededCount} instantané(s)`,
      );
      if (failedCount > 0 && typeof data?.error === "string" && data.error.trim()) {
        setError(data.error);
      }
      if (succeededCount > 0) {
        const succeededSet = new Set(succeededKeys);
        setSelectedKeys((prev) => prev.filter((k) => !succeededSet.has(k)));
      }
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBulkDeleting(false);
    }
  };

  if (loading) {
    return (
      <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="section-header mb-4 text-lg font-medium">Sauvegarde base de données (Cloudinary)</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="section-header mb-4 text-lg font-medium">Sauvegarde base de données (Cloudinary)</h2>
      <p className="mb-4 text-sm text-[var(--muted-foreground)]">
        Créez un instantané logique de la base (données des tables, tous schémas hors catalogues système) et
        déposez-le sur Cloudinary en ressource brute (NDJSON compressé, équivalent{" "}
        <span className="font-mono text-xs">.jsonl.gz</span>). Réutilise les mêmes identifiants que pour les
        factures PDF. Le schéma reste défini par les migrations du dépôt. Avec Neon (HTTP), chaque requête est
        limitée (~64 Mo) : l’export utilise de petits lots et tronque les gros champs (fichiers base64, etc.).
        Sur Cloudinary gratuit, un fichier raw ne peut pas dépasser ~10 Mo : la sauvegarde est découpée en plusieurs
        segments <span className="font-mono text-xs">part-000</span>, <span className="font-mono text-xs">part-001</span>, etc. (gzip autonomes) et un petit{" "}
        <span className="font-mono text-xs">manifest</span>. Option :{" "}
        <span className="font-mono text-xs">DATABASE_BACKUP_CLOUDINARY_MAX_PART_BYTES</span> (défaut 9 Mo).
      </p>

      {!configured ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-medium">Configuration Cloudinary requise</p>
          <p className="mt-1 text-xs opacity-90">
            Variables : <span className="font-mono">CLOUDINARY_CLOUD_NAME</span>,{" "}
            <span className="font-mono">CLOUDINARY_API_KEY</span>,{" "}
            <span className="font-mono">CLOUDINARY_API_SECRET</span>. Optionnel :{" "}
            <span className="font-mono">CLOUDINARY_BACKUP_FOLDER</span> (défaut{" "}
            <span className="font-mono">database-backups</span>) — dossier des fichiers raw de sauvegarde ;{" "}
            <span className="font-mono">DATABASE_BACKUP_PAGE_SIZE</span> (défaut 25) si une erreur « response is
            too large » persiste ; <span className="font-mono">DATABASE_BACKUP_CLOUDINARY_MAX_PART_BYTES</span> si un
            segment gzip dépasse encore la limite Cloudinary.
          </p>
        </div>
      ) : null}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {lastMessage && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          {lastMessage}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSnapshot}
          disabled={!configured || backupPending}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
        >
          {backupPending ? "Sauvegarde en cours…" : "Créer un instantané Cloudinary"}
        </button>
        <button
          type="button"
          onClick={() => fetchStatus()}
          className="rounded-lg px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          Actualiser la liste
        </button>
        <button
          type="button"
          onClick={handleDeleteSelectedSnapshots}
          disabled={!configured || selectedKeys.length === 0 || backupPending || bulkDeleting || deletingKey !== null}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
        >
          {bulkDeleting
            ? "Suppression sélection…"
            : `Supprimer la sélection (${selectedKeys.length.toLocaleString("fr-FR")})`}
        </button>
        {configured && cloudName ? (
          <span className="text-xs text-[var(--muted-foreground)]">
            Cloud : <span className="font-mono">{cloudName}</span>
            {backupFolder ? (
              <>
                {" "}
                · dossier <span className="font-mono">{backupFolder}</span>
              </>
            ) : null}
          </span>
        ) : null}
      </div>

      {configured && recent.length > 0 ? (
        <div className="max-h-[280px] overflow-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--primary-muted)]">
              <tr>
                <th className="table-header px-4 py-2 text-center font-medium">
                  <input
                    type="checkbox"
                    checked={recent.length > 0 && selectedKeys.length === recent.length}
                    onChange={toggleSelectAllSnapshots}
                    aria-label="Sélectionner tous les instantanés"
                    disabled={backupPending || bulkDeleting || deletingKey !== null}
                  />
                </th>
                <th className="table-header px-4 py-2 text-left font-medium">Identifiant (public_id)</th>
                <th className="table-header px-4 py-2 text-right font-medium">Fichiers sur Cloudinary</th>
                <th className="table-header px-4 py-2 text-right font-medium">Taille</th>
                <th className="table-header px-4 py-2 text-left font-medium">Date</th>
                <th className="table-header px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.key} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selectedKeys.includes(r.key)}
                      onChange={() => toggleSelectSnapshot(r.key)}
                      aria-label={`Sélectionner ${r.key}`}
                      disabled={backupPending || bulkDeleting || deletingKey === r.key}
                    />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs break-all text-[var(--foreground)]">{r.key}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--muted-foreground)]">
                    {(typeof r.parts === "number" && r.parts > 0 ? r.parts : 1).toLocaleString("fr-FR")}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--muted-foreground)]">
                    {r.size.toLocaleString("fr-FR")} o
                  </td>
                  <td className="px-4 py-2 text-[var(--muted-foreground)]">
                    {r.last_modified
                      ? new Date(r.last_modified).toLocaleString("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteSnapshot(r.key)}
                      disabled={backupPending || bulkDeleting || deletingKey === r.key}
                      className="rounded-lg border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                    >
                      {deletingKey === r.key ? "Suppression…" : "Supprimer"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : configured ? (
        <p className="text-sm text-[var(--muted-foreground)]">Aucune sauvegarde dans ce dossier pour l’instant.</p>
      ) : null}
    </section>
  );
}

function AccountTypesSection() {
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmoji, setCreateEmoji] = useState("");
  const [createPending, setCreatePending] = useState(false);
  const [editingType, setEditingType] = useState<AccountType | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAccountTypes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account-types");
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Échec du chargement");
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
        body: JSON.stringify({ name, sort_order: accountTypes.length, emoji: createEmoji || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la création");
      }
      const created = await res.json();
      setAccountTypes((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setCreateName("");
      setCreateEmoji("");
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
        body: JSON.stringify({ name, emoji: editEmoji || null }),
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
      setEditEmoji("");
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
          onClick={() => { setCreateModalOpen(true); setCreateName(""); setCreateEmoji(""); setError(null); }}
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
                <th className="table-header px-4 py-2 text-center font-medium w-12">Emoji</th>
                <th className="table-header px-4 py-2 text-left font-medium">Nom</th>
                <th className="table-header px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accountTypes.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
                    Aucun client. Créez-en un pour que les comptes puissent en avoir un.
                  </td>
                </tr>
              ) : (
                accountTypes.map((t) => (
                  <tr key={t.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 text-center">{t.emoji || "—"}</td>
                    <td className="px-4 py-2 text-[var(--foreground)]">{t.name}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setEditingType(t); setEditName(t.name); setEditEmoji(t.emoji ?? ""); setError(null); }}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => modalBackdropClose(e, () => setCreateModalOpen(false))}
        >
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
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Emoji (optionnel)</label>
                <Select value={createEmoji} onChange={(e) => setCreateEmoji(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
                  {EMOJI_OPTIONS.map(({ value, label }) => (
                    <option key={value || "none"} value={value}>
                      {value ? `${value} ${label}` : label}
                    </option>
                  ))}
                </Select>
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => modalBackdropClose(e, () => setEditingType(null))}
        >
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
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Emoji (optionnel)</label>
                <Select value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
                  {EMOJI_OPTIONS.map(({ value, label }) => (
                    <option key={value || "none"} value={value}>
                      {value ? `${value} ${label}` : label}
                    </option>
                  ))}
                </Select>
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
  const [createEmoji, setCreateEmoji] = useState("");
  const [createColor, setCreateColor] = useState<string | null>(null);
  const [createOpacity, setCreateOpacity] = useState<number | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [editingStatus, setEditingStatus] = useState<AccountStatus | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
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
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Échec du chargement");
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
      const body: { name: string; sort_order: number; emoji?: string | null; background_color?: string | null; background_opacity?: number | null } = {
        name,
        sort_order: accountStatuses.length,
      };
      if (createEmoji.trim()) body.emoji = createEmoji.trim();
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
      setCreateEmoji("");
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
      const body: { name: string; emoji?: string | null; background_color?: string | null; background_opacity?: number | null } = { name };
      body.emoji = editEmoji.trim() ? editEmoji.trim() : null;
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
      setEditEmoji("");
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
          onClick={() => { setCreateModalOpen(true); setCreateName(""); setCreateEmoji(""); setCreateColor(null); setCreateOpacity(null); setError(null); }}
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
                <th className="table-header px-4 py-2 text-center font-medium w-12">Emoji</th>
                <th className="table-header px-4 py-2 text-left font-medium">Nom</th>
                <th className="table-header px-4 py-2 text-center font-medium w-10" title="Par défaut">★</th>
                <th className="table-header px-4 py-2 text-center font-medium w-16">Fond</th>
                <th className="table-header px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accountStatuses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
                    Aucun statut de compte. Créez-en un pour que les comptes puissent en avoir un.
                  </td>
                </tr>
              ) : (
                accountStatuses.map((s) => (
                  <tr key={s.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 text-center">{s.emoji || "—"}</td>
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
                          onClick={() => { setEditingStatus(s); setEditName(s.name); setEditEmoji(s.emoji ?? ""); setEditColor(s.background_color ?? null); setEditOpacity(s.background_opacity ?? null); setError(null); }}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => modalBackdropClose(e, () => setCreateModalOpen(false))}
        >
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
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Emoji (optionnel)</label>
                <Select value={createEmoji} onChange={(e) => setCreateEmoji(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
                  {EMOJI_OPTIONS.map(({ value, label }) => (
                    <option key={value || "none"} value={value}>
                      {value ? `${value} ${label}` : label}
                    </option>
                  ))}
                </Select>
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => modalBackdropClose(e, () => setEditingStatus(null))}
        >
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
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Emoji (optionnel)</label>
                <Select value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
                  {EMOJI_OPTIONS.map(({ value, label }) => (
                    <option key={value || "none"} value={value}>
                      {value ? `${value} ${label}` : label}
                    </option>
                  ))}
                </Select>
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => modalBackdropClose(e, () => setCreateModalOpen(false))}
        >
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => modalBackdropClose(e, () => setEditingSource(null))}
        >
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

function FournisseursSection() {
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPending, setCreatePending] = useState(false);
  const [editingFournisseur, setEditingFournisseur] = useState<Fournisseur | null>(null);
  const [editName, setEditName] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchFournisseurs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fournisseurs");
      if (!res.ok) throw new Error("Échec du chargement");
      const data = await res.json();
      setFournisseurs(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFournisseurs();
  }, [fetchFournisseurs]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;
    setCreatePending(true);
    setError(null);
    try {
      const res = await fetch("/api/fournisseurs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sort_order: fournisseurs.length }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la création");
      }
      const created = await res.json();
      setFournisseurs((prev) =>
        [...prev, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      );
      setCreateName("");
      setCreateModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setCreatePending(false);
    }
  };

  const handleEdit = async () => {
    if (!editingFournisseur) return;
    const name = editName.trim();
    if (!name) return;
    setEditPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/fournisseurs/${editingFournisseur.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la mise à jour");
      }
      const updated = await res.json();
      setFournisseurs((prev) =>
        prev
          .map((f) => (f.id === editingFournisseur.id ? { ...f, ...updated } : f))
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      );
      setEditingFournisseur(null);
      setEditName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setEditPending(false);
    }
  };

  const handleDelete = async (f: Fournisseur) => {
    if (!confirm(`Supprimer le fournisseur « ${f.name} » ? Les transactions associées n’auront plus de fournisseur.`)) return;
    setDeletingId(f.id);
    setError(null);
    try {
      const res = await fetch(`/api/fournisseurs/${f.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la suppression");
      }
      setFournisseurs((prev) => prev.filter((x) => x.id !== f.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="section-header mb-4 text-lg font-medium">Fournisseurs</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="section-header mb-4 text-lg font-medium">Fournisseurs</h2>
      <p className="mb-4 text-sm text-[var(--muted-foreground)]">
        Créez des fournisseurs pour les associer aux transactions dans le tableau (sélection dans la colonne « Fournisseur »).
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h3 className="subsection-header text-sm font-medium">Fournisseurs enregistrés</h3>
        <button
          type="button"
          onClick={() => {
            setCreateModalOpen(true);
            setCreateName("");
            setError(null);
          }}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
        >
          Ajouter un fournisseur
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
              {fournisseurs.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
                    Aucun fournisseur. Créez-en un pour le tableau des transactions.
                  </td>
                </tr>
              ) : (
                fournisseurs.map((f) => (
                  <tr key={f.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 text-[var(--foreground)]">{f.name}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFournisseur(f);
                            setEditName(f.name);
                            setError(null);
                          }}
                          className="rounded px-2 py-1 text-sm text-[var(--primary)] hover:bg-[var(--primary-muted)]"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(f)}
                          disabled={deletingId === f.id}
                          className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          {deletingId === f.id ? "…" : "Supprimer"}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => modalBackdropClose(e, () => setCreateModalOpen(false))}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="subsection-header mb-4 text-lg font-medium">Nouveau fournisseur</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Ex. Fournisseur principal"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
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

      {editingFournisseur && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => modalBackdropClose(e, () => setEditingFournisseur(null))}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="subsection-header mb-4 text-lg font-medium">Modifier {editingFournisseur.name}</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ex. Fournisseur principal"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingFournisseur(null)}
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
    .invoice-header { display: flex; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #2c3e50; align-items: flex-start; }
    .invoice-title { font-size: 24px; font-weight: 700; color: #2c3e50; margin: 0; }
    .invoice-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .logo-wrap img { max-height: 54px; max-width: 180px; object-fit: contain; }
    .invoice-meta { text-align: right; }
    .addresses { display: flex; justify-content: space-between; gap: 40px; margin-bottom: 24px; }
    table.line-items { width: 100%; border-collapse: collapse; }
    table.line-items th, table.line-items td { padding: 10px 12px; text-align: left; }
    table.line-items th.text-right, table.line-items td.text-right { text-align: right; }
    .totals { margin-left: auto; width: 280px; margin-top: 24px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; }
    .payment-box { margin-top: 16px; margin-left: auto; width: 280px; padding: 12px; border: 1px solid #e9ecef; border-radius: 4px; line-height: 1.5; }
    .payment-box strong { display: block; margin-bottom: 4px; color: #2c3e50; }
  </style>
</head>
<body>
  <header class="invoice-header">
    <h1 class="invoice-title">Facture {{invoice.number}}</h1>
    <div class="invoice-right">
      {{#if company.logo_url}}<div class="logo-wrap"><img src="{{company.logo_url}}" alt="{{company.name}}" /></div>{{/if}}
      <div class="invoice-meta"><strong>Date d'émission</strong> {{formatDate invoice.issueDate}}{{#if invoice.dueDate}}<br><br><strong>Échéance</strong> {{formatDate invoice.dueDate}}{{/if}}</div>
    </div>
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
  {{#if payment.iban}}<div class="payment-box"><strong>Coordonnées bancaires (RIB)</strong><div>IBAN : {{payment.iban}}</div>{{#if payment.bic}}<div>BIC : {{payment.bic}}</div>{{/if}}</div>{{/if}}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => modalBackdropClose(e, () => setCreateModalOpen(false))}
        >
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
                <select
                  value={createCountry}
                  onChange={(e) => {
                    suppressNextModalBackdropClose();
                    setCreateCountry(e.target.value);
                  }}
                  onBlur={() => suppressNextModalBackdropClose()}
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                >
                  <option value="FR">France</option>
                  <option value="BE">Belgique</option>
                  <option value="CO">Colombie</option>
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => modalBackdropClose(e, () => setEditingTemplate(null))}
        >
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="subsection-header mb-4 text-lg font-medium">Modifier {editingTemplate.name}</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Pays</label>
                <select
                  value={editCountry}
                  onChange={(e) => {
                    suppressNextModalBackdropClose();
                    setEditCountry(e.target.value);
                  }}
                  onBlur={() => suppressNextModalBackdropClose()}
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                >
                  <option value="FR">France</option>
                  <option value="BE">Belgique</option>
                  <option value="CO">Colombie</option>
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
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [sessionRoleLoading, setSessionRoleLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [superAdminIds, setSuperAdminIds] = useState<string[]>([]);
  const [superAdminSavingId, setSuperAdminSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editNewPassword, setEditNewPassword] = useState("");
  const [editConfirmPassword, setEditConfirmPassword] = useState("");
  const [editSavePending, setEditSavePending] = useState(false);

  const canAccessSettingsPage = canMutate(sessionRole);

  const loadUsers = useCallback(async () => {
    try {
      const session = await getCachedSession();
      const role = session?.user?.role ?? null;
      setSessionRole(role);
      setIsAdmin(role === "admin");
      setCurrentUserId(session?.user?.id ?? null);

      if (role === "admin") {
        const [{ data }, linksRes, superRes] = await Promise.all([
          authClient.admin.listUsers({
            query: { limit: 50, sortBy: "createdAt", sortDirection: "desc" },
          }),
          fetch("/api/admin/users/telegram-links"),
          fetch("/api/admin/app-super-admins"),
        ]);
        const userList = (data?.users ?? []) as User[];
        if (superRes.ok) {
          const body = await superRes.json();
          setSuperAdminIds(Array.isArray(body.user_ids) ? body.user_ids : []);
        } else {
          setSuperAdminIds([]);
        }
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
      } else {
        setUsers([]);
        setSuperAdminIds([]);
      }
    } catch {
      setSessionRole(null);
      setIsAdmin(false);
      setCurrentUserId(null);
      setUsers([]);
      setSuperAdminIds([]);
    } finally {
      setUsersLoading(false);
      setSessionRoleLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!sessionRoleLoading && !canAccessSettingsPage) {
      router.replace("/dashboard");
    }
  }, [canAccessSettingsPage, router, sessionRoleLoading]);

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

  const handleSetRole = async (userId: string, role: AppRole) => {
    setActionError(null);
    const { error } = await authClient.admin.setRole({
      userId,
      role: role as unknown as "user" | "admin",
    });
    if (error) {
      setActionError(error.message ?? "Échec de la modification du rôle.");
      return;
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role } : u))
    );
  };

  const handleToggleSuperAdmin = async (userId: string, enabled: boolean) => {
    setActionError(null);
    setSuperAdminSavingId(userId);
    try {
      if (enabled) {
        const res = await fetch("/api/admin/app-super-admins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        });
        const body = res.ok ? null : await res.json().catch(() => ({}));
        if (!res.ok) {
          setActionError(
            typeof (body as { error?: string }).error === "string"
              ? (body as { error: string }).error
              : "Échec de l'ajout super-admin."
          );
          return;
        }
        setSuperAdminIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
      } else {
        const res = await fetch(
          `/api/admin/app-super-admins?user_id=${encodeURIComponent(userId)}`,
          { method: "DELETE" }
        );
        const body = res.ok ? null : await res.json().catch(() => ({}));
        if (!res.ok) {
          setActionError(
            typeof (body as { error?: string }).error === "string"
              ? (body as { error: string }).error
              : "Échec de la révocation super-admin."
          );
          return;
        }
        setSuperAdminIds((prev) => prev.filter((id) => id !== userId));
      }
    } finally {
      setSuperAdminSavingId(null);
    }
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditNewPassword("");
    setEditConfirmPassword("");
    setActionError(null);
  };

  const closeEditUserModal = () => {
    setEditingUser(null);
    setEditNewPassword("");
    setEditConfirmPassword("");
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    const np = editNewPassword.trim();
    const cp = editConfirmPassword.trim();
    const anyPasswordField = np !== "" || cp !== "";
    const isOtherUser = editingUser.id !== currentUserId;

    if (isOtherUser && anyPasswordField) {
      if (!np || !cp) {
        setActionError("Remplissez les deux champs de mot de passe ou laissez-les vides.");
        return;
      }
      if (np !== cp) {
        setActionError("Les mots de passe ne correspondent pas.");
        return;
      }
      if (np.length < 8) {
        setActionError("Le mot de passe doit contenir au moins 8 caractères.");
        return;
      }
    }

    setEditSavePending(true);
    setActionError(null);
    const { error } = await authClient.admin.updateUser({
      userId: editingUser.id,
      data: { name: editName.trim(), email: editEmail.trim() },
    });
    if (error) {
      setActionError(error.message ?? "Échec de la mise à jour.");
      setEditSavePending(false);
      return;
    }

    if (isOtherUser && np.length >= 8) {
      const { error: pwError } = await authClient.admin.setUserPassword({
        userId: editingUser.id,
        newPassword: np,
      });
      if (pwError) {
        setActionError(pwError.message ?? "Échec du changement de mot de passe.");
        setEditSavePending(false);
        return;
      }
    }

    setUsers((prev) =>
      prev.map((u) =>
        u.id === editingUser.id
          ? { ...u, name: editName.trim(), email: editEmail.trim() }
          : u
      )
    );
    closeEditUserModal();
    setEditSavePending(false);
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

  if (sessionRoleLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 overflow-auto p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
        </main>
      </div>
    );
  }

  if (!canAccessSettingsPage) return null;

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
            <p className="mb-4 text-sm text-[var(--muted-foreground)]">
              La colonne « Super-admin » donne accès à la page Rapports (statistiques financières agrégées).
              Pour retirer votre propre accès super-admin, un autre administrateur doit décocher la case.
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
                      <th className="table-header px-4 py-2 text-center font-medium">
                        Super-admin
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
                          colSpan={6}
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
                          isSuperAdmin={superAdminIds.includes(u.id)}
                          superAdminPending={superAdminSavingId === u.id}
                          onToggleSuperAdmin={handleToggleSuperAdmin}
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
                currentUserId={currentUserId}
                name={editName}
                email={editEmail}
                newPassword={editNewPassword}
                confirmPassword={editConfirmPassword}
                onNameChange={setEditName}
                onEmailChange={setEditEmail}
                onNewPasswordChange={setEditNewPassword}
                onConfirmPasswordChange={setEditConfirmPassword}
                onSave={handleUpdateUser}
                onClose={closeEditUserModal}
                savePending={editSavePending}
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

        {!usersLoading && isAdmin && <DatabaseBackupSection />}

        {/* Section Clients - visible aux admins */}
        {!usersLoading && isAdmin && <AccountTypesSection />}

        {/* Section Statuts de comptes - visible aux admins */}
        {!usersLoading && isAdmin && <AccountStatusesSection />}

        {/* Section Sources - visible aux admins */}
        {!usersLoading && isAdmin && (
          <>
            <SourcesSection />
            <FournisseursSection />
          </>
        )}

        {/* Session MTProto (création de groupes) — visible aux admins */}
        {!usersLoading && isAdmin && (
          <TelegramConnectionSection />
        )}

        {/* Section Templates de facture - visible aux admins */}
        {!usersLoading && isAdmin && <TemplatesSection />}
      </main>
    </div>
  );
}
