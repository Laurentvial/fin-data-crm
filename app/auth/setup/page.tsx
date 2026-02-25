"use client";

import { useActionState } from "react";
import { setupFirstAdminAction } from "./actions";

export default function SetupPage() {
  const [state, formAction, isPending] = useActionState(setupFirstAdminAction, null);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">
            Configuration initiale
          </h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Créez le premier compte administrateur. Cette page ne doit être
            utilisée qu&apos;une seule fois.
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-[var(--foreground)]"
            >
              Nom
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Admin"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-[var(--foreground)]"
            >
              Adresse email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="admin@exemple.com"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[var(--foreground)]"
            >
              Mot de passe (min. 8 caractères)
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

          {state?.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
              {state.error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Création..." : "Créer le compte admin"}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--muted-foreground)]">
          Après la création, connectez-vous puis assignez le rôle admin dans la
          Neon Console (Auth → Users → Make admin) si nécessaire.
        </p>
      </div>
    </div>
  );
}
