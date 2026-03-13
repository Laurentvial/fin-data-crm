"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInWithEmail } from "./actions";

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState(signInWithEmail, null);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[var(--primary-muted)] via-[var(--background)] to-[var(--accent-muted)] p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-[var(--primary-muted-border)] bg-[var(--card)] p-8 shadow-lg">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]">
            <span className="text-xl font-bold">F</span>
          </div>
          <h1 className="page-title text-2xl font-semibold">
            Connexion à FinData Pro
          </h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Accédez à l&apos;application avec vos identifiants
          </p>
        </div>

        <form action={formAction} className="space-y-4">
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
              placeholder="vous@exemple.com"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[var(--foreground)]"
            >
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              placeholder="••••••••"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            />
          </div>

          {state?.error && (
            <div className="rounded-lg border border-[var(--destructive-muted)] bg-[var(--destructive-muted)]/50 px-3 py-2 text-sm text-[var(--destructive)]">
              {state.error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:opacity-50 transition-colors shadow-sm"
          >
            {isPending ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        {process.env.NEXT_PUBLIC_SHOW_FIRST_ACCOUNT_SETUP === "true" && (
          <p className="text-center text-xs text-[var(--muted-foreground)]">
            Les comptes sont créés par les administrateurs dans les paramètres.{" "}
            <Link
              href="/auth/setup"
              className="text-[var(--primary)] hover:underline"
            >
              Premier compte ?
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
