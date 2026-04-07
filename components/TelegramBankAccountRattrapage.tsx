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

function btnClass(disabled: boolean) {
  return `rounded-lg border border-[var(--border)] bg-[var(--primary)] px-2.5 py-1.5 text-xs font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 shrink-0`;
}

function companyFileTypeLabel(fileType: string): string {
  const labels: Record<string, string> = {
    logo: "Logo société",
    kbis: "KBIS",
    statut: "Statuts",
    pi_gerant: "Pièce d’identité gérant",
    pi_recto: "Pièce d’identité recto",
    pi_verso: "Pièce d’identité verso",
    selfie: "Selfie",
  };
  if (labels[fileType]) return labels[fileType];
  if (fileType.startsWith("autre_")) return `Autre (${fileType.slice(6)})`;
  return fileType || "Document";
}

function formatSyncResponse(data: Record<string, unknown>, headline: string): string {
  const lines: string[] = [headline];
  if (typeof data.invite_note === "string" && data.invite_note.trim()) {
    lines.push(data.invite_note.trim());
  }
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
  return lines.join("\n");
}

export interface TelegramBankAccountRattrapageProps {
  bankAccountId: string;
  accountName: string;
  telegramChatId: string;
  hasBankLogo: boolean;
  /** Société liée au compte : documents à envoyer un par un sur le groupe Telegram. */
  companyId?: string | null;
  defaultExpanded?: boolean;
  welcomeDraft?: string;
}

type CompanyFileRow = {
  id: string;
  file_type: string;
  filename: string | null;
  content_type?: string | null;
};

export function TelegramBankAccountRattrapage({
  bankAccountId,
  accountName,
  telegramChatId,
  hasBankLogo,
  companyId = null,
  defaultExpanded = false,
  welcomeDraft = "",
}: TelegramBankAccountRattrapageProps) {
  const [telegramCatchUpExpanded, setTelegramCatchUpExpanded] = useState(defaultExpanded);
  const [telegramSyncTitle, setTelegramSyncTitle] = useState("");
  const [telegramCustomLogoLabel, setTelegramCustomLogoLabel] = useState<string | null>(null);
  const telegramCustomLogoRef = useRef<{ base64: string; contentType: string } | null>(null);
  const [telegramWelcome, setTelegramWelcome] = useState("");
  const [telegramUsersList, setTelegramUsersList] = useState<
    { telegram_id: number; telegram_username?: string; name?: string }[]
  >([]);
  const [telegramUsersLoading, setTelegramUsersLoading] = useState(false);
  const [companyFiles, setCompanyFiles] = useState<CompanyFileRow[]>([]);
  const [companyFilesLoading, setCompanyFilesLoading] = useState(false);
  /** Clef de l’action en cours (ex. title, logo-bank, invite-123, promote-456). */
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [telegramSyncResult, setTelegramSyncResult] = useState<string | null>(null);

  const chatOk =
    String(telegramChatId ?? "").trim().length > 0 &&
    /^-?\d+$/.test(String(telegramChatId ?? "").trim());

  useEffect(() => {
    setTelegramSyncTitle(accountName.trim());
    setTelegramWelcome(welcomeDraft ?? "");
    setTelegramCustomLogoLabel(null);
    telegramCustomLogoRef.current = null;
    setTelegramSyncResult(null);
    setBusyKey(null);
    setTelegramCatchUpExpanded(defaultExpanded);
    setCompanyFiles([]);
    setTelegramUsersList([]);
    setTelegramUsersLoading(false);
    setCompanyFilesLoading(false);
    // welcomeDraft volontairement exclu : recalcul parent (IBAN, etc.) ne doit pas réinitialiser le panneau ni annuler le fetch utilisateurs.
  }, [bankAccountId, accountName, companyId, defaultExpanded]);

  useEffect(() => {
    setTelegramWelcome(welcomeDraft ?? "");
  }, [welcomeDraft]);

  useEffect(() => {
    if (!telegramCatchUpExpanded) {
      setTelegramUsersLoading(false);
      return;
    }
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
        } else if (!cancelled) {
          setTelegramUsersList([]);
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

  useEffect(() => {
    if (!telegramCatchUpExpanded || !companyId?.trim()) {
      setCompanyFiles([]);
      setCompanyFilesLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setCompanyFilesLoading(true);
      try {
        const res = await fetch(
          `/api/accounts/${encodeURIComponent(companyId.trim())}/files?include_logo=1`,
        );
        const data = (await res.json()) as unknown;
        if (!cancelled && res.ok && Array.isArray(data)) {
          setCompanyFiles(data as CompanyFileRow[]);
        } else if (!cancelled) {
          setCompanyFiles([]);
        }
      } catch {
        if (!cancelled) setCompanyFiles([]);
      } finally {
        if (!cancelled) setCompanyFilesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [telegramCatchUpExpanded, companyId]);

  const appendLog = (block: string) => {
    setTelegramSyncResult((prev) => (prev ? `${prev}\n\n—\n\n${block}` : block));
  };

  const runAction = async (key: string, body: Record<string, unknown>, successHeadline: string) => {
    if (!chatOk) return;
    setBusyKey(key);
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 300_000);
    try {
      const res = await fetch(`/api/bank-accounts/${bankAccountId}/telegram-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      let data: Record<string, unknown> = {};
      try {
        data = (await res.json()) as Record<string, unknown>;
      } catch {
        data = {};
      }
      if (!res.ok) {
        appendLog(typeof data.error === "string" ? data.error : `Erreur ${res.status}`);
        return;
      }
      let headline = successHeadline;
      if (data.attachment_sent === false) {
        const ae =
          typeof data.attachment_error === "string" && data.attachment_error.trim()
            ? data.attachment_error.trim()
            : "Le fichier n’a pas été envoyé sur Telegram.";
        headline = `Fichier : ${ae}`;
      } else if (data.logo_applied === false) {
        const le =
          typeof data.logo_error === "string" && data.logo_error.trim()
            ? data.logo_error.trim()
            : "La photo du groupe n’a pas pu être mise à jour (droits administrateur sur le groupe, format d’image, ou erreur côté Telegram).";
        headline = `Logo : ${le}`;
      }
      appendLog(formatSyncResponse(data, headline));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        appendLog(
          "Délai dépassé (5 min). Le service Telegram est peut‑être occupé (invitations / flood‑wait). Réessayez ou consultez les logs du service.",
        );
      } else {
        appendLog(err instanceof Error ? err.message : "Erreur inconnue");
      }
    } finally {
      window.clearTimeout(t);
      setBusyKey(null);
    }
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
  };

  const applyTitle = () => {
    const t = telegramSyncTitle.trim();
    if (!t) {
      appendLog("Nom du groupe : saisissez un titre avant d’appliquer.");
      return;
    }
    return runAction("title", { update_title: true, telegram_title: t }, "Nom du groupe mis à jour.");
  };

  const sendBankLogo = () =>
    runAction("logo-bank", { apply_bank_logo: true }, "Logo banque envoyé sur le groupe.");

  const sendCompanyFileToTelegram = (file: CompanyFileRow) => {
    const label = companyFileTypeLabel(file.file_type);
    const short = file.filename?.trim() ? `${label} (${file.filename.trim()})` : label;
    return runAction(`company-file-${file.id}`, { company_file_id: file.id }, `Fichier société envoyé : ${short}.`);
  };

  const sendCustomLogo = () => {
    const custom = telegramCustomLogoRef.current;
    if (!custom) {
      appendLog("Choisissez d’abord une image.");
      return;
    }
    return runAction(
      "logo-custom",
      { logo_base64: custom.base64, logo_content_type: custom.contentType },
      "Image personnalisée envoyée sur le groupe.",
    );
  };

  const postWelcome = () => {
    const msg = telegramWelcome.trim();
    if (!msg) {
      appendLog("Message vide : rien à publier.");
      return;
    }
    return runAction("welcome", { welcome_message: msg }, "Message publié dans le groupe.");
  };

  const inviteUser = (telegramId: number, promoteAfter: boolean) => {
    const key = promoteAfter ? `invite-promote-${telegramId}` : `invite-simple-${telegramId}`;
    return runAction(
      key,
      {
        invite_telegram_ids: [telegramId],
        promote_invite_users: promoteAfter,
      },
      promoteAfter
        ? `Invitation (avec droit d’ajouter des membres) : ID ${telegramId}.`
        : `Invitation : ID ${telegramId}.`,
    );
  };

  const promoteOnlyUser = (telegramId: number) =>
    runAction(
      `promote-${telegramId}`,
      { promote_only_telegram_ids: [telegramId] },
      `Promotion (déjà membre) : ID ${telegramId}.`,
    );

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
        <div className="space-y-4 border-t border-[var(--border)] p-3 text-sm">
          <p className="text-xs text-[var(--muted-foreground)]">
            Chaque action envoie une requête au service Telegram. Sur supergroupe, « droit d’inviter » = admin limité ;
            sur petit groupe classique, Telegram n’expose que l’admin complet.
          </p>
          {telegramSyncResult && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs whitespace-pre-wrap">
              {telegramSyncResult}
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)]/50 p-3">
            <p className="text-xs font-medium text-[var(--foreground)]">Nom du groupe Telegram</p>
            <input
              type="text"
              value={telegramSyncTitle}
              onChange={(e) => setTelegramSyncTitle(e.target.value)}
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void applyTitle()}
              disabled={!chatOk || busyKey !== null}
              className={btnClass(!chatOk || busyKey !== null)}
            >
              {busyKey === "title" ? "Envoi…" : "Appliquer ce nom sur Telegram"}
            </button>
          </div>

          <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)]/50 p-3">
            <p className="text-xs font-medium text-[var(--foreground)]">Photo du groupe</p>
            <button
              type="button"
              onClick={() => void sendBankLogo()}
              disabled={!chatOk || !hasBankLogo || busyKey !== null}
              className={btnClass(!chatOk || !hasBankLogo || busyKey !== null)}
            >
              {busyKey === "logo-bank" ? "Envoi…" : "Envoyer le logo de la banque"}
            </button>
            {!hasBankLogo ? (
              <p className="text-xs text-[var(--muted-foreground)]">Aucun logo enregistré pour cette banque.</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <label className="text-xs text-[var(--muted-foreground)]">
                Image personnalisée
                <input
                  type="file"
                  accept="image/*"
                  className="ml-2 max-w-[min(100%,12rem)] text-[var(--foreground)]"
                  onChange={(e) => void handleTelegramCustomLogo(e)}
                />
              </label>
              {telegramCustomLogoLabel ? (
                <span className="text-xs text-[var(--foreground)]">{telegramCustomLogoLabel}</span>
              ) : null}
              <button
                type="button"
                onClick={() => void sendCustomLogo()}
                disabled={!chatOk || !telegramCustomLogoRef.current || busyKey !== null}
                className={btnClass(!chatOk || !telegramCustomLogoRef.current || busyKey !== null)}
              >
                {busyKey === "logo-custom" ? "Envoi…" : "Envoyer cette image"}
              </button>
            </div>
          </div>

          {companyId?.trim() ? (
            <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)]/50 p-3">
              <p className="text-xs font-medium text-[var(--foreground)]">Documents de la société</p>
              <p className="text-[11px] leading-snug text-[var(--muted-foreground)]">
                Fichiers enregistrés sur la fiche Société (KBIS, statuts, pièces d’identité, logo, etc.). Chaque bouton
                envoie un seul document dans le groupe.
              </p>
              {companyFilesLoading ? (
                <p className="text-xs text-[var(--muted-foreground)]">Chargement des documents…</p>
              ) : companyFiles.length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)]">Aucun document sur la société.</p>
              ) : (
                <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
                  {companyFiles.map((f) => {
                    const typeLabel = companyFileTypeLabel(f.file_type);
                    const subtitle = f.filename?.trim() ? f.filename.trim() : (f.content_type ?? "");
                    const busy = busyKey === `company-file-${f.id}`;
                    return (
                      <li
                        key={f.id}
                        className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <span className="font-medium text-[var(--foreground)]">{typeLabel}</span>
                          {subtitle ? (
                            <span className="mt-0.5 block text-[11px] text-[var(--muted-foreground)]">
                              {subtitle}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void sendCompanyFileToTelegram(f)}
                          disabled={!chatOk || busyKey !== null}
                          className={btnClass(!chatOk || busyKey !== null)}
                        >
                          {busy ? "Envoi…" : "Envoyer sur Telegram"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}

          <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)]/50 p-3">
            <p className="text-xs font-medium text-[var(--foreground)]">Message dans le groupe</p>
            <textarea
              value={telegramWelcome}
              onChange={(e) => setTelegramWelcome(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void postWelcome()}
              disabled={!chatOk || busyKey !== null}
              className={btnClass(!chatOk || busyKey !== null)}
            >
              {busyKey === "welcome" ? "Envoi…" : "Publier ce message"}
            </button>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]/50 p-3">
            <p className="mb-2 text-xs font-medium text-[var(--foreground)]">Utilisateurs CRM liés à Telegram</p>
            {telegramUsersLoading ? (
              <p className="text-xs text-[var(--muted-foreground)]">Chargement…</p>
            ) : telegramUsersList.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">Aucun compte Telegram lié (admin ou paramètres utilisateurs).</p>
            ) : (
              <ul className="max-h-52 space-y-2 overflow-y-auto text-xs">
                {telegramUsersList.map((u) => {
                  const label =
                    u.name || (u.telegram_username ? `@${u.telegram_username}` : `ID ${u.telegram_id}`);
                  const invSimpleBusy = busyKey === `invite-simple-${u.telegram_id}`;
                  const invPromoteBusy = busyKey === `invite-promote-${u.telegram_id}`;
                  const proBusy = busyKey === `promote-${u.telegram_id}`;
                  return (
                    <li
                      key={u.telegram_id}
                      className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                    >
                      <span className="font-medium text-[var(--foreground)]">{label}</span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void inviteUser(u.telegram_id, false)}
                          disabled={!chatOk || busyKey !== null}
                          className={btnClass(!chatOk || busyKey !== null)}
                        >
                          {invSimpleBusy ? "…" : "Inviter"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void inviteUser(u.telegram_id, true)}
                          disabled={!chatOk || busyKey !== null}
                          className={btnClass(!chatOk || busyKey !== null)}
                          title="Admin limité en supergroupe : peut ajouter des membres"
                        >
                          {invPromoteBusy ? "…" : "Inviter + droit membres"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void promoteOnlyUser(u.telegram_id)}
                          disabled={!chatOk || busyKey !== null}
                          className={`rounded-lg border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1.5 text-xs font-medium text-[var(--foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          {proBusy ? "…" : "Promouvoir (déjà membre)"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-[11px] leading-snug text-[var(--muted-foreground)]">
              « Inviter » ajoute la personne au groupe. « Inviter + droit membres » l’ajoute puis lui donne le droit
              d’inviter d’autres personnes (supergroupe). « Promouvoir (déjà membre) » : la personne est déjà dans le
              groupe, on applique seulement la promotion.
            </p>
          </div>

          {!chatOk && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Renseignez un ID de groupe Telegram valide pour ce compte pour utiliser ces actions.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
