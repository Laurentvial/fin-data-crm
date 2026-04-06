"use client";

import { useEffect, useRef, useState } from "react";

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

export interface TelegramBankAccountRattrapageProps {
  bankAccountId: string;
  /** Used as default suggested title when resetting (e.g. compte name). */
  accountName: string;
  telegramChatId: string;
  hasBankLogo: boolean;
  /** Open the collapsible section on mount (e.g. after creating an account). */
  defaultExpanded?: boolean;
}

export function TelegramBankAccountRattrapage({
  bankAccountId,
  accountName,
  telegramChatId,
  hasBankLogo,
  defaultExpanded = false,
}: TelegramBankAccountRattrapageProps) {
  const [telegramCatchUpExpanded, setTelegramCatchUpExpanded] = useState(defaultExpanded);
  const [telegramSyncTitle, setTelegramSyncTitle] = useState("");
  const [telegramUpdateTitle, setTelegramUpdateTitle] = useState(false);
  const [telegramApplyBankLogo, setTelegramApplyBankLogo] = useState(false);
  const [telegramCustomLogoLabel, setTelegramCustomLogoLabel] = useState<string | null>(null);
  const telegramCustomLogoRef = useRef<{ base64: string; contentType: string } | null>(null);
  const [telegramInviteIds, setTelegramInviteIds] = useState<Set<number>>(() => new Set());
  const [telegramPromoteOnInvite, setTelegramPromoteOnInvite] = useState(true);
  const [telegramPromoteOnlyIds, setTelegramPromoteOnlyIds] = useState<Set<number>>(() => new Set());
  const [telegramWelcome, setTelegramWelcome] = useState("");
  const [telegramUsersList, setTelegramUsersList] = useState<
    { telegram_id: number; telegram_username?: string; name?: string }[]
  >([]);
  const [telegramUsersLoading, setTelegramUsersLoading] = useState(false);
  const [telegramSyncRunning, setTelegramSyncRunning] = useState(false);
  const [telegramSyncResult, setTelegramSyncResult] = useState<string | null>(null);

  useEffect(() => {
    setTelegramSyncTitle(accountName.trim());
    setTelegramUpdateTitle(false);
    setTelegramApplyBankLogo(!!hasBankLogo);
    setTelegramInviteIds(new Set());
    setTelegramPromoteOnlyIds(new Set());
    setTelegramWelcome("");
    setTelegramCustomLogoLabel(null);
    telegramCustomLogoRef.current = null;
    setTelegramSyncResult(null);
    setTelegramCatchUpExpanded(defaultExpanded);
  }, [bankAccountId, accountName, hasBankLogo, defaultExpanded]);

  useEffect(() => {
    if (!telegramCatchUpExpanded) return;
    let cancelled = false;
    (async () => {
      setTelegramUsersLoading(true);
      try {
        const res = await fetch("/api/bank-accounts/telegram-users");
        const data = (await res.json()) as {
          users?: { telegram_id: number; telegram_username?: string; name?: string }[];
        };
        if (!cancelled && res.ok && Array.isArray(data.users)) {
          setTelegramUsersList(data.users);
        }
      } catch {
        if (!cancelled) setTelegramUsersList([]);
      } finally {
        if (!cancelled) setTelegramUsersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [telegramCatchUpExpanded]);

  const toggleTelegramInvite = (tid: number) => {
    setTelegramInviteIds((prev) => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid);
      else next.add(tid);
      return next;
    });
  };

  const toggleTelegramPromoteOnly = (tid: number) => {
    setTelegramPromoteOnlyIds((prev) => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid);
      else next.add(tid);
      return next;
    });
  };

  const handleTelegramCustomLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      telegramCustomLogoRef.current = null;
      setTelegramCustomLogoLabel(null);
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ""));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!m) {
      telegramCustomLogoRef.current = null;
      setTelegramCustomLogoLabel(null);
      return;
    }
    telegramCustomLogoRef.current = { contentType: m[1], base64: m[2] };
    setTelegramCustomLogoLabel(file.name);
    setTelegramApplyBankLogo(false);
  };

  const runTelegramCatchUp = async () => {
    const custom = telegramCustomLogoRef.current;
    const hasTitle = telegramUpdateTitle && telegramSyncTitle.trim().length > 0;
    const hasLogo = Boolean(custom) || telegramApplyBankLogo;
    const hasInv = telegramInviteIds.size > 0;
    const hasPo = telegramPromoteOnlyIds.size > 0;
    const hasWel = telegramWelcome.trim().length > 0;
    if (!hasTitle && !hasLogo && !hasInv && !hasPo && !hasWel) {
      setTelegramSyncResult("Cochez au moins une action (titre, logo, invitations, promotions ou message).");
      return;
    }
    setTelegramSyncRunning(true);
    setTelegramSyncResult(null);
    try {
      const body: Record<string, unknown> = {};
      if (hasTitle) {
        body.update_title = true;
        body.telegram_title = telegramSyncTitle.trim();
      }
      if (custom) {
        body.logo_base64 = custom.base64;
        body.logo_content_type = custom.contentType;
      } else if (telegramApplyBankLogo) {
        body.apply_bank_logo = true;
      }
      if (hasInv) {
        body.invite_telegram_ids = [...telegramInviteIds];
        body.promote_invite_users = telegramPromoteOnInvite;
      }
      if (hasPo) {
        body.promote_only_telegram_ids = [...telegramPromoteOnlyIds];
      }
      if (hasWel) {
        body.welcome_message = telegramWelcome.trim();
      }
      const res = await fetch(`/api/bank-accounts/${bankAccountId}/telegram-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let data: Record<string, unknown> = {};
      try {
        data = (await res.json()) as Record<string, unknown>;
      } catch {
        data = {};
      }
      if (!res.ok) {
        setTelegramSyncResult(
          typeof data.error === "string" ? data.error : `Erreur ${res.status}`,
        );
        return;
      }
      const lines: string[] = ["Opération Telegram terminée."];
      if (typeof data.classic_chat_admin_note === "string") {
        lines.push(data.classic_chat_admin_note);
      }
      const invited = data.invited;
      if (Array.isArray(invited) && invited.length > 0) {
        lines.push(`Invités : ${invited.join(", ")}.`);
      }
      const failed = data.failed;
      if (Array.isArray(failed) && failed.length > 0) {
        lines.push(
          `Échecs invitation : ${failed.map((f: { telegram_id?: number; reason?: string }) => `${f.telegram_id ?? "?"} (${f.reason ?? ""})`).join(" ; ")}`,
        );
      }
      const apf = data.admin_promote_failed;
      if (Array.isArray(apf) && apf.length > 0) {
        lines.push(
          `Échecs promotion : ${apf.map((f: { telegram_id?: number; reason?: string }) => `${f.telegram_id ?? "?"} (${f.reason ?? ""})`).join(" ; ")}`,
        );
      }
      const pof = data.promote_only_failed;
      if (Array.isArray(pof) && pof.length > 0) {
        lines.push(
          `Échecs promotion (membres déjà présents) : ${pof.map((f: { telegram_id?: number; reason?: string }) => `${f.telegram_id ?? "?"} (${f.reason ?? ""})`).join(" ; ")}`,
        );
      }
      setTelegramSyncResult(lines.join("\n"));
    } catch (err) {
      setTelegramSyncResult(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setTelegramSyncRunning(false);
    }
  };

  return (
    <div className="col-span-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/15">
      <button
        type="button"
        onClick={() => setTelegramCatchUpExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]/40"
      >
        <span>Rattrapage Telegram (logo, nom, membres…)</span>
        <span className="text-[var(--muted-foreground)]">
          {telegramCatchUpExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </span>
      </button>
      {telegramCatchUpExpanded && (
        <div className="space-y-3 border-t border-[var(--border)] p-3 text-sm">
          <p className="text-xs text-[var(--muted-foreground)]">
            Actions optionnelles sur le groupe lié. Le service Telegram doit être disponible. Sur supergroupe, « droit
            d’inviter » = admin limité ; sur petit groupe classique, Telegram n’expose que l’admin complet.
          </p>
          {telegramSyncResult && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs whitespace-pre-wrap">
              {telegramSyncResult}
            </div>
          )}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={telegramUpdateTitle}
              onChange={(e) => setTelegramUpdateTitle(e.target.checked)}
              className="mt-1"
            />
            <span>
              Mettre à jour le nom affiché du groupe Telegram
              <input
                type="text"
                value={telegramSyncTitle}
                onChange={(e) => setTelegramSyncTitle(e.target.value)}
                disabled={!telegramUpdateTitle}
                className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm disabled:opacity-50"
              />
            </span>
          </label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={telegramApplyBankLogo}
                onChange={(e) => {
                  setTelegramApplyBankLogo(e.target.checked);
                  if (e.target.checked) {
                    telegramCustomLogoRef.current = null;
                    setTelegramCustomLogoLabel(null);
                  }
                }}
                disabled={!hasBankLogo || !!telegramCustomLogoLabel}
              />
              <span>
                Envoyer le logo de la banque du compte comme photo du groupe
                {!hasBankLogo ? (
                  <span className="text-[var(--muted-foreground)]"> (aucun logo enregistré pour cette banque)</span>
                ) : null}
              </span>
            </label>
            <label className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
              Ou image personnalisée (prioritaire sur le logo banque)
              <input
                type="file"
                accept="image/*"
                className="max-w-full text-[var(--foreground)]"
                onChange={handleTelegramCustomLogo}
              />
              {telegramCustomLogoLabel ? (
                <span className="text-[var(--foreground)]">{telegramCustomLogoLabel}</span>
              ) : null}
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--muted-foreground)]">Message à poster dans le groupe (optionnel)</span>
            <textarea
              value={telegramWelcome}
              onChange={(e) => setTelegramWelcome(e.target.value)}
              rows={2}
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </label>
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--foreground)]">Utilisateurs CRM liés à Telegram</p>
            {telegramUsersLoading ? (
              <p className="text-xs text-[var(--muted-foreground)]">Chargement…</p>
            ) : telegramUsersList.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">Aucun compte Telegram lié (admin ou paramètres utilisateurs).</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
                {telegramUsersList.map((u) => {
                  const label =
                    u.name || (u.telegram_username ? `@${u.telegram_username}` : `ID ${u.telegram_id}`);
                  return (
                    <div key={u.telegram_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={telegramInviteIds.has(u.telegram_id)}
                          onChange={() => toggleTelegramInvite(u.telegram_id)}
                        />
                        Inviter {label}
                      </label>
                      <label className="flex items-center gap-1 text-[var(--muted-foreground)]">
                        <input
                          type="checkbox"
                          checked={telegramPromoteOnlyIds.has(u.telegram_id)}
                          onChange={() => toggleTelegramPromoteOnly(u.telegram_id)}
                        />
                        Promouvoir seulement (déjà dans le groupe)
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={telegramPromoteOnInvite}
                onChange={(e) => setTelegramPromoteOnInvite(e.target.checked)}
              />
              Après invitation : leur donner le droit d’ajouter d’autres membres (admin limité en supergroupe)
            </label>
          </div>
          <button
            type="button"
            onClick={runTelegramCatchUp}
            disabled={
              telegramSyncRunning ||
              !String(telegramChatId ?? "").trim() ||
              !/^-?\d+$/.test(String(telegramChatId ?? "").trim())
            }
            className="rounded-lg border border-[var(--border)] bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {telegramSyncRunning ? "Envoi au service Telegram…" : "Exécuter sur Telegram"}
          </button>
          {(!String(telegramChatId ?? "").trim() || !/^-?\d+$/.test(String(telegramChatId ?? "").trim())) && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Renseignez un ID de groupe Telegram valide pour ce compte pour lancer le rattrapage.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
