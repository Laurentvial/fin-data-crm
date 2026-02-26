"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import type { Bank } from "@/lib/types";

type User = { id: string; email: string; name: string; role?: string };

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
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
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim();

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
      setError(
        params.get("telegram_error") === "invalid"
          ? "Données Telegram invalides. Vérifiez que le domaine est lié dans BotFather et que TELEGRAM_BOT_TOKEN est correct."
          : "Erreur de configuration Telegram."
      );
      window.history.replaceState({}, "", "/settings");
    }
  }, [fetchStatus]);

  useEffect(() => {
    if (!status?.linked && botUsername && widgetContainerRef.current && !widgetContainerRef.current.querySelector("script")) {
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.setAttribute("data-telegram-login", botUsername);
      script.setAttribute("data-size", "large");
      script.setAttribute("data-auth-url", `${typeof window !== "undefined" ? window.location.origin : ""}/api/telegram-callback`);
      script.async = true;
      widgetContainerRef.current.appendChild(script);
    }
  }, [status?.linked, botUsername]);

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
        <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">Mon Telegram</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">Mon Telegram</h2>
      <p className="mb-4 text-sm text-[var(--muted-foreground)]">
        Liez votre compte Telegram pour être automatiquement ajouté aux groupes créés lors de l&apos;ajout de comptes bancaires.
        <span className="mt-2 block text-xs">
          Astuce : ajoutez le compte admin Telegram à vos contacts. Vérifiez aussi que Paramètres → Confidentialité → Groupes et canaux → « Qui peut vous ajouter aux groupes » est sur « Tout le monde » ou « Mes contacts ».
        </span>
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
      ) : botUsername ? (
        <div ref={widgetContainerRef} className="min-h-[50px]" />
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
        <h3 className="mb-4 text-lg font-medium text-[var(--foreground)]">
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
        <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">
          Connexion Telegram
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">
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
  const [createLogoFile, setCreateLogoFile] = useState<File | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [editName, setEditName] = useState("");
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null);
  const [editPending, setEditPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
        body: JSON.stringify({ name }),
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
        body: JSON.stringify({ name }),
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
    setEditLogoFile(null);
    setError(null);
  };

  if (loading) {
    return (
      <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">Banques</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
      <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">Banques</h2>
      <p className="mb-4 text-sm text-[var(--muted-foreground)]">
        Créez des banques et importez leurs logos. Lors de la création ou modification d&apos;un compte bancaire, vous pourrez associer une banque.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--foreground)]">Banques existantes</h3>
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
        >
          Ajouter une banque
        </button>
      </div>

      <div>
        <div className="rounded-lg border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)]">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-[var(--foreground)]">Logo</th>
                <th className="px-4 py-2 text-left font-medium text-[var(--foreground)]">Nom</th>
                <th className="px-4 py-2 text-right font-medium text-[var(--foreground)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {banks.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
                    Aucune banque
                  </td>
                </tr>
              ) : (
                banks.map((b) => (
                  <tr key={b.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-[var(--muted)]">
                        <img
                          src={`/api/banks/${b.id}/files/logo`}
                          alt=""
                          className="h-full w-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-[var(--foreground)]">{b.name}</td>
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

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCreateModalOpen(false)}>
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-medium text-[var(--foreground)]">Ajouter une banque</h3>
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
            <h3 className="mb-4 text-lg font-medium text-[var(--foreground)]">Modifier {editingBank.name}</h3>
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
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Logo</label>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="h-16 w-16 overflow-hidden rounded border border-[var(--border)] bg-[var(--muted)]">
                    <img
                      src={`/api/banks/${editingBank.id}/files/logo?t=${Date.now()}`}
                      alt=""
                      className="h-full w-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
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
    const { data: session } = await authClient.getSession();
    const role = session?.user?.role;
    setIsAdmin(role === "admin");
    setCurrentUserId(session?.user?.id ?? null);

    if (role === "admin") {
      const { data } = await authClient.admin.listUsers({
        query: { limit: 50, sortBy: "createdAt", sortDirection: "desc" },
      });
      setUsers(data?.users ?? []);
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
        <h1 className="mb-6 text-2xl font-semibold text-[var(--foreground)]">
          Paramètres
        </h1>

        {/* Section Utilisateurs - visible uniquement aux admins */}
        {!usersLoading && isAdmin && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">
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
              <h3 className="mb-2 text-sm font-medium text-[var(--foreground)]">
                Utilisateurs existants
              </h3>
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-[var(--foreground)]">
                        Nom
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-[var(--foreground)]">
                        Email
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-[var(--foreground)]">
                        Rôle
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-[var(--foreground)]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
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

        {/* Section Connexion Telegram (session MTProto) - visible aux admins */}
        {!usersLoading && isAdmin && (
          <TelegramConnectionSection />
        )}

        <section className="mt-8">
          <h2 className="mb-2 text-lg font-medium text-[var(--foreground)]">
            Sources de données
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Les paramètres des sources de données seront disponibles ici.
          </p>
        </section>
      </main>
    </div>
  );
}
