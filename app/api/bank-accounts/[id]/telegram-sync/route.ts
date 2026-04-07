import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";

export const maxDuration = 300;

function telegramSyncTimeoutMs(): number {
  const n = Number(process.env.TELEGRAM_CREATE_GROUP_TIMEOUT_MS);
  if (Number.isFinite(n) && n >= 5000) return Math.min(n, 290_000);
  return 240_000;
}

function isFetchAbortOrTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError" || err.name === "TimeoutError") return true;
  const msg = err.message.toLowerCase();
  if (msg.includes("aborted") || msg.includes("timeout")) return true;
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    if (cause.name === "AbortError" || cause.name === "TimeoutError")
      return true;
    if (String(cause).toLowerCase().includes("timeout")) return true;
  }
  return false;
}

async function parseServiceError(res: Response, errText: string): Promise<string> {
  let msg = "Échec du service Telegram.";
  try {
    const errData = JSON.parse(errText) as {
      detail?: string | Array<string | { msg?: string }>;
    };
    const d = errData?.detail;
    const raw =
      typeof d === "string"
        ? d
        : Array.isArray(d) && d[0]
          ? String((d[0] as { msg?: string }).msg ?? d[0])
          : msg;
    msg = raw;
  } catch {
    if (errText.trim()) msg = errText.slice(0, 2000);
  }
  return msg;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez vous reconnecter." },
      { status: 401 },
    );
  }

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const updateTitle = body.update_title === true;
  const telegramTitle =
    typeof body.telegram_title === "string" ? body.telegram_title.trim() : "";
  const applyBankLogo = body.apply_bank_logo === true;
  const logoBase64 =
    typeof body.logo_base64 === "string" && body.logo_base64.trim()
      ? body.logo_base64.trim()
      : undefined;
  const logoContentType =
    typeof body.logo_content_type === "string" && body.logo_content_type.trim()
      ? body.logo_content_type.trim()
      : undefined;
  const welcomeMessage =
    typeof body.welcome_message === "string" ? body.welcome_message.trim() : "";

  const companyFileIdRaw = body.company_file_id;
  const companyFileId =
    typeof companyFileIdRaw === "string" && companyFileIdRaw.trim()
      ? companyFileIdRaw.trim()
      : undefined;

  const inviteIdsRaw = body.invite_telegram_ids;
  const inviteTelegramIds: number[] = Array.isArray(inviteIdsRaw)
    ? inviteIdsRaw
        .map((x) => {
          const n = typeof x === "number" ? x : Number(x);
          return Number.isFinite(n) ? Math.trunc(n) : null;
        })
        .filter((x): x is number => x !== null)
    : [];

  const promoteInviteUsers =
    body.promote_invite_users === false ? false : true;

  const promoteOnlyRaw = body.promote_only_telegram_ids;
  const promoteOnlyIds: number[] = Array.isArray(promoteOnlyRaw)
    ? promoteOnlyRaw
        .map((x) => {
          const n = typeof x === "number" ? x : Number(x);
          return Number.isFinite(n) ? Math.trunc(n) : null;
        })
        .filter((x): x is number => x !== null)
    : [];

  if (updateTitle && !telegramTitle) {
    return NextResponse.json(
      {
        error:
          "Mise à jour du nom du groupe : le champ titre est vide. Saisissez le nom à appliquer sur Telegram ou décochez cette option.",
      },
      { status: 400 },
    );
  }

  const titleForService = updateTitle ? telegramTitle : "";
  const hasLogoRequest =
    applyBankLogo || Boolean(logoBase64 && logoContentType);

  const hasWork =
    Boolean(titleForService) ||
    hasLogoRequest ||
    inviteTelegramIds.length > 0 ||
    promoteOnlyIds.length > 0 ||
    Boolean(welcomeMessage) ||
    Boolean(companyFileId);

  if (!hasWork) {
    return NextResponse.json(
      {
        error:
          "Aucune action sélectionnée : titre, logo, fichiers société, invitations, promotions ou message.",
      },
      { status: 400 },
    );
  }

  const serviceUrl = process.env.TELEGRAM_GROUP_SERVICE_URL;
  const apiKey = process.env.TELEGRAM_SERVICE_API_KEY;
  if (!serviceUrl?.trim() || !apiKey?.trim()) {
    return NextResponse.json(
      {
        error:
          "Service Telegram non configuré (TELEGRAM_GROUP_SERVICE_URL, TELEGRAM_SERVICE_API_KEY).",
      },
      { status: 503 },
    );
  }

  try {
    const [row] = await sql`
      SELECT ba.telegram_chat_id, ba.bank_id
      FROM bank_accounts ba
      WHERE ba.id = ${id}
      LIMIT 1
    `;
    if (!row) {
      return NextResponse.json(
        { error: "Compte bancaire introuvable." },
        { status: 404 },
      );
    }
    const chatId = row.telegram_chat_id;
    if (chatId === null || chatId === undefined) {
      return NextResponse.json(
        { error: "Ce compte n'a pas d'ID groupe Telegram." },
        { status: 400 },
      );
    }

    let logoB64 = logoBase64;
    let logoCt = logoContentType;

    if (applyBankLogo && !logoB64 && row.bank_id) {
      const [logoRow] = await sql`
        SELECT data_base64, content_type
        FROM bank_files
        WHERE bank_id = ${row.bank_id}::uuid AND file_type = 'logo'
        LIMIT 1
      `;
      if (logoRow && typeof logoRow.data_base64 === "string") {
        logoB64 = logoRow.data_base64 as string;
        logoCt = (logoRow.content_type as string) || "image/png";
      }
    }

    if (applyBankLogo && !logoB64) {
      return NextResponse.json(
        {
          error:
            "Aucun logo enregistré pour cette banque. Ajoutez-le dans Paramètres → Banques, ou utilisez une image personnalisée.",
        },
        { status: 400 },
      );
    }

    if (logoB64 && !logoCt) {
      return NextResponse.json(
        { error: "Type MIME manquant pour le logo personnalisé." },
        { status: 400 },
      );
    }

    const usersPayload: { telegram_id: string; telegram_username?: string }[] = [];
    if (inviteTelegramIds.length > 0) {
      const links = await sql`
        SELECT ut.telegram_id, ut.telegram_username
        FROM user_telegram ut
        WHERE ut.telegram_id = ANY(${inviteTelegramIds}::bigint[])
      `;
      const byId = new Map(
        links.map((r) => [String(r.telegram_id), r.telegram_username as string | null]),
      );
      for (const tid of inviteTelegramIds) {
        const key = String(tid);
        const uname = byId.get(key);
        usersPayload.push({
          telegram_id: key,
          ...(typeof uname === "string" && uname ? { telegram_username: uname } : {}),
        });
      }
    }

    /** String preserves full Telegram peer ids in JSON (Number loses precision above 2^53). */
    const chatIdPayload =
      typeof chatId === "bigint" ? chatId.toString() : String(chatId).trim();

    const payload: Record<string, unknown> = {
      chat_id: chatIdPayload,
    };
    if (titleForService) payload.title = titleForService;
    if (logoB64 && logoCt) {
      payload.logo_base64 = logoB64;
      payload.logo_content_type = logoCt;
    }
    if (usersPayload.length > 0) {
      payload.users = usersPayload;
      payload.promote_invite_users = promoteInviteUsers;
    }
    if (promoteOnlyIds.length > 0) {
      payload.promote_only_telegram_ids = promoteOnlyIds.map((id) => String(id));
    }
    if (welcomeMessage) payload.welcome_message = welcomeMessage;

    if (companyFileId) {
      const [cf] = await sql`
        SELECT cf.data_base64, cf.filename, cf.file_type
        FROM company_files cf
        INNER JOIN bank_accounts ba ON ba.company_id = cf.company_id
        WHERE ba.id = ${id} AND cf.id = ${companyFileId}::uuid
        LIMIT 1
      `;
      if (!cf || typeof cf.data_base64 !== "string") {
        return NextResponse.json(
          {
            error:
              "Fichier société introuvable ou non lié à cette société. Vérifiez la fiche Société → Documents.",
          },
          { status: 404 },
        );
      }
      const ft = String(cf.file_type ?? "");
      const labels: Record<string, string> = {
        logo: "Logo société",
        kbis: "KBIS",
        statut: "Statuts",
        pi_gerant: "Pièce d'identité gérant",
        pi_recto: "Pièce d'identité recto",
        pi_verso: "Pièce d'identité verso",
        selfie: "Selfie",
      };
      const base =
        labels[ft] ?? (ft.startsWith("autre_") ? `Autre (${ft.slice(6)})` : ft || "Document");
      const fn = (cf.filename as string | null) ?? null;
      const caption = fn?.trim() ? `${base} — ${fn.trim()}` : base;
      payload.attachment_base64 = cf.data_base64 as string;
      payload.attachment_filename = fn;
      payload.attachment_caption = caption;
    }

    const tmo = telegramSyncTimeoutMs();
    let res: Response;
    try {
      res = await fetch(
        `${serviceUrl.replace(/\/$/, "")}/sync-group`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(tmo),
        },
      );
    } catch (err) {
      if (isFetchAbortOrTimeout(err)) {
        return NextResponse.json(
          {
            error: `Le service Telegram n'a pas répondu dans les délais (${Math.round(tmo / 1000)} s). Réessayez ou augmentez TELEGRAM_CREATE_GROUP_TIMEOUT_MS.`,
          },
          { status: 504 },
        );
      }
      console.error("telegram-sync fetch error:", err);
      return NextResponse.json(
        { error: "Impossible de contacter le service Telegram." },
        { status: 502 },
      );
    }

    const text = await res.text();
    if (!res.ok) {
      const msg = await parseServiceError(res, text);
      console.error("telegram-sync service error:", res.status, msg);
      return NextResponse.json(
        { error: msg },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        { error: "Réponse invalide du service Telegram." },
        { status: 502 },
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    console.error("POST /api/bank-accounts/[id]/telegram-sync error:", e);
    return NextResponse.json(
      { error: "Échec de la synchronisation Telegram." },
      { status: 500 },
    );
  }
}
