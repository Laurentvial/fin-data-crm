"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function TelegramCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get("id");
    const hash = searchParams.get("hash");

    if (!id || !hash) {
      setStatus("error");
      setError("Données invalides");
      return;
    }

    const run = async () => {
      try {
        const userData: Record<string, string | number> = {};
        const keys = ["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"];
        for (const key of keys) {
          const val = searchParams.get(key);
          if (val != null) {
            if (key === "id" || key === "auth_date") {
              const num = parseInt(val, 10);
              userData[key] = Number.isNaN(num) ? val : num;
            } else {
              userData[key] = val;
            }
          }
        }

        const res = await fetch("/api/users/me/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userData),
          credentials: "same-origin",
        });

        const data = await res.json();

        if (res.ok) {
          setStatus("success");
          if (typeof window !== "undefined" && window.opener) {
            window.opener.location.href = "/settings?telegram=linked";
            window.close();
          } else {
            window.location.href = "/settings?telegram=linked";
          }
        } else {
          setStatus("error");
          const errMsg = data.error ?? "Échec de la liaison";
          setError(errMsg);
          if (typeof window !== "undefined" && window.opener) {
            window.opener.location.href = "/settings?telegram_error=invalid";
            window.close();
          }
        }
      } catch {
        setStatus("error");
        setError("Erreur réseau");
      }
    };

    run();
  }, [searchParams]);

  if (status === "processing") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-[var(--muted-foreground)]">Liaison en cours…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <a
          href="/settings"
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-[var(--primary-foreground)] hover:opacity-90"
        >
          Retour aux paramètres
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <p className="text-[var(--muted-foreground)]">Redirection…</p>
    </div>
  );
}

export default function TelegramCallbackPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-6">Chargement…</div>}>
      <TelegramCallbackContent />
    </Suspense>
  );
}
