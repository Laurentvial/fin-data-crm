"use client";

import { useEffect } from "react";

export default function TelegramSuccessPage() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (window.opener) {
        window.opener.location.href = "/settings?telegram=linked";
        window.close();
      } else {
        window.location.href = "/settings?telegram=linked";
      }
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <p className="text-[var(--foreground)]">Connexion réussie !</p>
      <p className="text-sm text-[var(--muted-foreground)]">
        Fermeture de la fenêtre…
      </p>
    </div>
  );
}
