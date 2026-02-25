"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { createUserAction } from "./actions";

type User = { id: string; email: string; name: string; role?: string };

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

export default function SettingsPage() {
  const [state, formAction, isPending] = useActionState(createUserAction, null);
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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
  }, [loadUsers, state]);

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
              action={formAction}
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
                  disabled={isPending}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {isPending ? "Création..." : "Créer le compte"}
                </button>
              </div>
            </form>

            {(state?.error || actionError) && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                {state?.error ?? actionError}
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
