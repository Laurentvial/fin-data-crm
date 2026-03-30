import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";

/** Lets Vercel / similar run this route longer than the default (proxy still needs matching read timeout). */
export const maxDuration = 300;

function telegramCreateTimeoutMs(): number {
  const n = Number(process.env.TELEGRAM_CREATE_GROUP_TIMEOUT_MS);
  if (Number.isFinite(n) && n >= 5000) return Math.min(n, 290_000);
  return 120_000;
}

function maxKbisBase64Chars(): number {
  const n = Number(process.env.TELEGRAM_CREATE_MAX_KBIS_BASE64_CHARS);
  if (Number.isFinite(n) && n > 10_000) return n;
  // Default ~2.1 MiB binary after decode — safer for Telegram worker on 512 MB RAM (e.g. Render Starter).
  return 2_800_000;
}

function isFetchAbortOrTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError" || err.name === "TimeoutError") return true;
  const msg = err.message.toLowerCase();
  if (msg.includes("aborted") || msg.includes("timeout")) return true;
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    if (cause.name === "AbortError" || cause.name === "TimeoutError") return true;
    if (String(cause).toLowerCase().includes("timeout")) return true;
  }
  return false;
}

/** Telegram supergroup IDs must stay exact for Postgres bigint; accept string from Python JSON. */
function normalizeTelegramChatIdFromService(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    const s = raw.trim();
    return /^-?\d+$/.test(s) ? s : null;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (!Number.isSafeInteger(Math.trunc(raw))) return null;
    return String(Math.trunc(raw));
  }
  return null;
}

function jsonSafeForResponse(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

/** Telegram MTProto user cannot create groups (spam report, UserRestricted, etc.) — user-facing French guidance. */
function friendlyTelegramCreateGroupError(raw: string): string {
  const low = raw.toLowerCase();
  if (
    low.includes("spamreport") ||
    low.includes("spam reported") ||
    low.includes("can't create channels") ||
    low.includes("cannot create channels") ||
    low.includes("can't create chats") ||
    low.includes("cannot create chats") ||
    (low.includes("you can't create") && (low.includes("channel") || low.includes("chat")))
  ) {
    return (
      "Telegram a restreint le compte utilisé par le serveur : il ne peut plus créer de groupes ou de supergroupes " +
      "(souvent après un signalement pour spam). " +
      "Que faire : (1) Paramètres de l'application (admin) → Session Telegram / création de groupes : reconnectez un autre numéro " +
      "Telegram qui n'a pas cette limitation ; " +
      "(2) Créez le groupe à la main avec un autre compte, puis à la création du compte bancaire cochez « Lier un groupe Telegram existant » " +
      "et saisissez l'ID du groupe (ex. -100…) ; " +
      "(3) Contacter le support Telegram depuis l'app si la restriction vous semble incorrecte."
    );
  }
  return raw;
}

async function requireAuth() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez vous reconnecter." },
      { status: 401 }
    );
  }
  return null;
}

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const rows = await sql`
      SELECT
        ba.id,
        ba.company_id,
        ba.name,
        ba.telegram_chat_id,
        ba.bank_id,
        ba.account_type_id,
        ba.account_status_id,
        ba.login,
        ba.password,
        ba.pin_code,
        ba.plafond_limit,
        ba.company_email_id,
        ba.company_phone_id,
        ce.email AS company_email,
        cp.phone AS company_phone,
        b.name AS bank_name,
        at.name AS account_type_name,
        at.emoji AS account_type_emoji,
        ast.name AS account_status_name,
        ast.emoji AS account_status_emoji,
        ast.background_color AS account_status_background_color,
        ast.background_opacity AS account_status_background_opacity,
        ba.created_at,
        ba.updated_at,
        c.name AS company_name,
        COALESCE(SUM(CASE WHEN t.type = 'DEBIT' THEN -t.amount ELSE t.amount END), 0)::float AS balance,
        EXISTS(SELECT 1 FROM bank_files bf WHERE bf.bank_id = ba.bank_id AND bf.file_type = 'logo') AS has_logo,
        EXISTS(SELECT 1 FROM bank_account_files baf WHERE baf.bank_account_id = ba.id AND baf.file_type = 'rib') AS has_rib,
        COALESCE(
          (SELECT json_agg(json_build_object('iban', bai.iban, 'bic', bai.bic) ORDER BY bai.created_at)
           FROM bank_account_ibans bai
           WHERE bai.bank_account_id = ba.id),
          '[]'::json
        ) AS ibans,
        COALESCE(
          (SELECT json_agg(json_build_object('numero', bac.numero, 'date_expiration', bac.date_expiration, 'cvv', bac.cvv) ORDER BY bac.created_at)
           FROM bank_account_cards bac
           WHERE bac.bank_account_id = ba.id),
          '[]'::json
        ) AS cards
      FROM bank_accounts ba
      JOIN companies c ON c.id = ba.company_id
      LEFT JOIN company_emails ce ON ce.id = ba.company_email_id
      LEFT JOIN company_phones cp ON cp.id = ba.company_phone_id
      LEFT JOIN banks b ON b.id = ba.bank_id
      LEFT JOIN account_types at ON at.id = ba.account_type_id
      LEFT JOIN account_statuses ast ON ast.id = ba.account_status_id
      LEFT JOIN transactions t ON t.bank_account_id = ba.id
      GROUP BY ba.id, ba.company_id, ba.name, ba.telegram_chat_id, ba.bank_id, ba.account_type_id, ba.account_status_id, ba.login, ba.password, ba.pin_code, ba.plafond_limit, ba.company_email_id, ba.company_phone_id, ce.email, cp.phone, b.name, at.name, at.emoji, ast.name, ast.emoji, ast.background_color, ast.background_opacity, ba.created_at, ba.updated_at, c.name
      ORDER BY c.name, ba.name
    `;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/bank-accounts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bank accounts" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const company_id = typeof body?.company_id === "string" ? body.company_id.trim() : "";
    const bank_id = typeof body?.bank_id === "string" ? body.bank_id.trim() : null;
    const account_type_id = typeof body?.account_type_id === "string" ? body.account_type_id.trim() || null : null;
    let account_status_id: string | null = typeof body?.account_status_id === "string" ? body.account_status_id.trim() || null : null;
    const ibansRaw = body?.ibans;
    const telegramChatIdRaw = body?.telegram_chat_id;
    const existingTelegramChatId =
      telegramChatIdRaw !== undefined && telegramChatIdRaw !== null && telegramChatIdRaw !== ""
        ? (typeof telegramChatIdRaw === "number"
            ? Number.isFinite(telegramChatIdRaw)
              ? Math.floor(telegramChatIdRaw)
              : null
            : typeof telegramChatIdRaw === "string"
              ? (() => {
                  const s = telegramChatIdRaw.trim();
                  if (!s) return null;
                  const n = parseInt(s, 10);
                  return Number.isFinite(n) ? n : null;
                })()
              : null)
        : null;

    const useExistingGroup = existingTelegramChatId !== null;
    const serviceUrl = process.env.TELEGRAM_GROUP_SERVICE_URL;
    const apiKey = process.env.TELEGRAM_SERVICE_API_KEY;
    if (!useExistingGroup && (!serviceUrl || !apiKey)) {
      return NextResponse.json(
        { error: "Service Telegram non configuré (TELEGRAM_GROUP_SERVICE_URL, TELEGRAM_SERVICE_API_KEY)." },
        { status: 503 }
      );
    }

    const login = typeof body?.login === "string" ? body.login.trim() || null : null;
    const password = typeof body?.password === "string" ? body.password.trim() || null : null;
    const pin_code = typeof body?.pin_code === "string" ? body.pin_code.trim() || null : null;
    const plafond_limit = typeof body?.plafond_limit === "string" ? body.plafond_limit.trim() || null : null;
    const company_email_id = typeof body?.company_email_id === "string" ? body.company_email_id.trim() || null : null;
    const company_phone_id = typeof body?.company_phone_id === "string" ? body.company_phone_id.trim() || null : null;
    const cardsRaw = body?.cards;
    const cardItems: { numero: string; date_expiration?: string | null; cvv?: string | null }[] = Array.isArray(cardsRaw)
      ? cardsRaw.flatMap((v: unknown) => {
          if (v && typeof v === "object" && "numero" in v && typeof (v as { numero: unknown }).numero === "string") {
            const obj = v as { numero: string; date_expiration?: string; cvv?: string };
            const numero = obj.numero.trim().replace(/\s/g, "");
            if (numero.length === 0) return [];
            const date_expiration = typeof obj.date_expiration === "string" ? obj.date_expiration.trim() || null : null;
            const cvv = typeof obj.cvv === "string" ? obj.cvv.trim().slice(0, 4) || null : null;
            return [{ numero, date_expiration, cvv }];
          }
          return [];
        })
      : [];

    const ibanItems: { iban: string; bic?: string | null }[] = Array.isArray(ibansRaw)
      ? ibansRaw.flatMap((v: unknown) => {
          if (typeof v === "string") {
            const iban = v.trim().replace(/\s/g, "").toUpperCase();
            return iban.length > 0 ? [{ iban, bic: null }] : [];
          }
          if (v && typeof v === "object" && "iban" in v && typeof (v as { iban: unknown }).iban === "string") {
            const obj = v as { iban: string; bic?: string };
            const iban = obj.iban.trim().replace(/\s/g, "").toUpperCase();
            if (iban.length === 0) return [];
            const bic =
              typeof obj.bic === "string" ? (obj.bic.trim().replace(/\s/g, "").toUpperCase().slice(0, 11) || null) : null;
            return [{ iban, bic }];
          }
          return [];
        })
      : [];
    if (!name) {
      return NextResponse.json(
        { error: "Le nom du compte est requis." },
        { status: 400 }
      );
    }
    if (!company_id) {
      return NextResponse.json(
        { error: "La société est requise." },
        { status: 400 }
      );
    }
    const [company] = await sql`
      SELECT id, name, address, code_postal, ville, siret, directeur
      FROM companies WHERE id = ${company_id}::uuid LIMIT 1
    `;
    if (!company) {
      return NextResponse.json(
        { error: "Société introuvable." },
        { status: 404 }
      );
    }
    if (company_email_id) {
      const [emCheck] = await sql`
        SELECT 1 FROM company_emails WHERE id = ${company_email_id}::uuid AND company_id = ${company_id}::uuid LIMIT 1
      `;
      if (!emCheck) {
        return NextResponse.json(
          { error: "L'email sélectionné n'appartient pas à cette société." },
          { status: 400 }
        );
      }
    }
    if (company_phone_id) {
      const [phCheck] = await sql`
        SELECT 1 FROM company_phones WHERE id = ${company_phone_id}::uuid AND company_id = ${company_id}::uuid LIMIT 1
      `;
      if (!phCheck) {
        return NextResponse.json(
          { error: "Le téléphone sélectionné n'appartient pas à cette société." },
          { status: 400 }
        );
      }
    }
    if (!account_status_id) {
      const [defaultStatus] = await sql`SELECT id FROM account_statuses WHERE is_default = true LIMIT 1`;
      account_status_id = defaultStatus?.id ? (defaultStatus.id as string) : null;
      if (!account_status_id) {
        return NextResponse.json(
          { error: "Aucun statut de compte par défaut trouvé. Créez des statuts et marquez-en un par défaut (★) dans Paramètres." },
          { status: 400 }
        );
      }
    } else {
      const [statusCheck] = await sql`SELECT 1 FROM account_statuses WHERE id = ${account_status_id}::uuid LIMIT 1`;
      if (!statusCheck) {
        return NextResponse.json(
          { error: "Statut de compte introuvable." },
          { status: 400 }
        );
      }
    }
    let bankName: string | null = null;
    if (bank_id) {
      const [bank] = await sql`SELECT id, name FROM banks WHERE id = ${bank_id}::uuid LIMIT 1`;
      if (!bank) {
        return NextResponse.json(
          { error: "Banque introuvable." },
          { status: 404 }
        );
      }
      bankName = (bank.name as string) ?? null;
    }
    let emailStr = "—";
    if (company_email_id) {
      const [emRow] = await sql`SELECT email FROM company_emails WHERE id = ${company_email_id}::uuid AND company_id = ${company_id}::uuid`;
      if (emRow) emailStr = (emRow.email as string) ?? "—";
    } else {
      const [defEmail] = await sql`SELECT email FROM company_emails WHERE company_id = ${company_id}::uuid AND is_default = true LIMIT 1`;
      if (defEmail) emailStr = (defEmail.email as string) ?? "—";
      else {
        const emailRows = await sql`SELECT email FROM company_emails WHERE company_id = ${company_id}::uuid ORDER BY email`;
        emailStr = emailRows.length > 0 ? (emailRows.map((r) => r.email as string).join(", ")) : "—";
      }
    }
    const [kbisRow] = await sql`
      SELECT filename, content_type, data_base64
      FROM company_files
      WHERE company_id = ${company_id}::uuid AND file_type = 'kbis'
      LIMIT 1
    `;
    const piDocRows = await sql`
      SELECT file_type, filename, content_type, data_base64
      FROM company_files
      WHERE company_id = ${company_id}::uuid AND file_type IN ('pi_recto', 'pi_verso')
    `;
    const title = name;

    const ibanStr =
      ibanItems.length > 0
        ? ibanItems.map((i) => (i.bic ? `${i.iban} (BIC: ${i.bic})` : i.iban)).join(", ")
        : "—";
    const addrParts = [
      typeof company.address === "string" ? company.address.trim() : "",
      typeof company.code_postal === "string" ? company.code_postal.trim() : "",
      typeof company.ville === "string" ? company.ville.trim() : "",
    ].filter(Boolean);
    const addressLine = addrParts.length > 0 ? addrParts.join(", ") : "—";
    const welcomeMessage = [
      `NOM STE : ${company.name}`,
      `ADRESSE : ${addressLine}`,
      `EMAIL : ${emailStr}`,
      `SIRET : ${(company.siret as string) ?? "—"}`,
      `DIRECTEUR : ${(company.directeur as string) ?? "—"}`,
      `IBAN : ${ibanStr}`,
      `BANQUE : ${bankName ?? "—"}`,
    ].join("\n\n");

    let logoBase64: string | null = null;
    let logoContentType: string | null = null;
    if (bank_id) {
      const [logoRow] = await sql`
        SELECT content_type, data_base64
        FROM bank_files
        WHERE bank_id = ${bank_id}::uuid AND file_type = 'logo'
        LIMIT 1
      `;
      if (logoRow && typeof logoRow.data_base64 === "string") {
        logoBase64 = logoRow.data_base64 as string;
        logoContentType = (logoRow.content_type as string) || "image/png";
      }
    }

    let telegramChatId: string;
    let invited: number[] = [];
    let failed: { telegram_id: number; telegram_username?: string; reason: string }[] = [];

    if (useExistingGroup) {
      telegramChatId = String(existingTelegramChatId!);
    } else {
      const telegramUsers = await sql`
        SELECT ut.telegram_id, ut.telegram_username
        FROM user_telegram ut
      `;
      const users =
        telegramUsers.length > 0
          ? telegramUsers.map((u) => ({
              telegram_id: Number(u.telegram_id),
              telegram_username: u.telegram_username ?? undefined,
            }))
          : undefined;

      const createGroupBody: {
        title: string;
        users?: { telegram_id: number; telegram_username?: string }[];
        logo_base64?: string;
        logo_content_type?: string;
        welcome_message?: string;
        kbis_base64?: string;
        kbis_content_type?: string;
        kbis_filename?: string;
        pi_recto_base64?: string;
        pi_recto_filename?: string;
        pi_verso_base64?: string;
        pi_verso_filename?: string;
      } = {
        title,
        users,
        welcome_message: welcomeMessage,
      };
      if (logoBase64 && logoContentType) {
        createGroupBody.logo_base64 = logoBase64;
        createGroupBody.logo_content_type = logoContentType;
        console.log("Sending bank logo to Telegram service:", logoContentType, logoBase64.length, "chars base64");
      } else {
        console.log("No bank logo to send (bank_id=%s, hasLogo=%s)", bank_id ?? "null", !!logoBase64);
      }
      const maxAttachB64 = maxKbisBase64Chars();
      if (kbisRow && typeof kbisRow.data_base64 === "string") {
        const kbisB64 = kbisRow.data_base64 as string;
        if (kbisB64.length <= maxAttachB64) {
          createGroupBody.kbis_base64 = kbisB64;
          createGroupBody.kbis_content_type = (kbisRow.content_type as string) || "application/pdf";
          if (typeof kbisRow.filename === "string" && kbisRow.filename) {
            createGroupBody.kbis_filename = kbisRow.filename;
          }
        } else {
          console.warn(
            "POST /api/bank-accounts: KBIS trop volumineux pour create-group (%s chars > %s), envoi sans pièce jointe Telegram.",
            kbisB64.length,
            maxAttachB64
          );
          createGroupBody.welcome_message = `${welcomeMessage}\n\n(NB : KBIS non joint automatiquement — fichier trop volumineux. Ajoutez-le manuellement au groupe ou augmentez TELEGRAM_CREATE_MAX_KBIS_BASE64_CHARS.)`;
        }
      }
      type PiRow = { file_type: string; filename?: string | null; data_base64?: string | null };
      const piRectoRow = (piDocRows as PiRow[]).find((r) => r.file_type === "pi_recto");
      const piVersoRow = (piDocRows as PiRow[]).find((r) => r.file_type === "pi_verso");
      if (piRectoRow && typeof piRectoRow.data_base64 === "string") {
        const b64 = piRectoRow.data_base64;
        if (b64.length <= maxAttachB64) {
          createGroupBody.pi_recto_base64 = b64;
          if (typeof piRectoRow.filename === "string" && piRectoRow.filename) {
            createGroupBody.pi_recto_filename = piRectoRow.filename;
          }
        } else {
          console.warn(
            "POST /api/bank-accounts: pi_recto trop volumineux pour create-group (%s chars > %s), ignoré.",
            b64.length,
            maxAttachB64
          );
        }
      }
      if (piVersoRow && typeof piVersoRow.data_base64 === "string") {
        const b64 = piVersoRow.data_base64;
        if (b64.length <= maxAttachB64) {
          createGroupBody.pi_verso_base64 = b64;
          if (typeof piVersoRow.filename === "string" && piVersoRow.filename) {
            createGroupBody.pi_verso_filename = piVersoRow.filename;
          }
        } else {
          console.warn(
            "POST /api/bank-accounts: pi_verso trop volumineux pour create-group (%s chars > %s), ignoré.",
            b64.length,
            maxAttachB64
          );
        }
      }
      let bodyJson: string;
      try {
        bodyJson = JSON.stringify(createGroupBody);
      } catch (stringifyErr) {
        console.error("POST /api/bank-accounts: JSON.stringify(create-group body) failed:", stringifyErr);
        delete createGroupBody.kbis_base64;
        delete createGroupBody.kbis_content_type;
        delete createGroupBody.kbis_filename;
        delete createGroupBody.pi_recto_base64;
        delete createGroupBody.pi_recto_filename;
        delete createGroupBody.pi_verso_base64;
        delete createGroupBody.pi_verso_filename;
        delete createGroupBody.logo_base64;
        delete createGroupBody.logo_content_type;
        createGroupBody.welcome_message = `${welcomeMessage}\n\n(NB : pièces jointes omises — erreur de sérialisation.)`;
        bodyJson = JSON.stringify(createGroupBody);
      }
      const tmo = telegramCreateTimeoutMs();
      let createRes: Response;
      try {
        createRes = await fetch(`${serviceUrl!.replace(/\/$/, "")}/create-group`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey!,
          },
          body: bodyJson,
          signal: AbortSignal.timeout(tmo),
        });
      } catch (fetchErr) {
        if (isFetchAbortOrTimeout(fetchErr)) {
          return NextResponse.json(
            {
              error: `Le service Telegram n'a pas répondu dans les délais (${Math.round(tmo / 1000)} s). Augmentez TELEGRAM_CREATE_GROUP_TIMEOUT_MS et le timeout du proxy devant Node (ex. proxy_read_timeout dans nginx) pour qu'il dépasse cette durée ; réduisez la taille du KBIS ; ou utilisez « Lier un groupe Telegram existant ». Une page HTML « 502 » sans message JSON indique en général un timeout du proxy, pas l'application.`,
            },
            { status: 504 }
          );
        }
        const err = fetchErr as NodeJS.ErrnoException & { cause?: { code?: string } };
        const code = err?.cause?.code ?? err?.code;
        if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT") {
          return NextResponse.json(
            {
              error:
                "Le service Telegram est inaccessible. Vérifiez que le service est démarré (TELEGRAM_GROUP_SERVICE_URL) ou utilisez « Lier un groupe Telegram existant » en saisissant l'ID du groupe.",
            },
            { status: 502 }
          );
        }
        console.error("Telegram create-group fetch error:", fetchErr);
        return NextResponse.json(
          { error: "Impossible de contacter le service Telegram." },
          { status: 502 }
        );
      }
      if (!createRes.ok) {
        const errText = await createRes.text();
        let msg = "Impossible de créer le groupe Telegram";
        try {
          const errData = JSON.parse(errText) as { detail?: string | Array<string | { msg?: string }> };
          const d = errData?.detail;
          const raw =
            typeof d === "string"
              ? d
              : Array.isArray(d) && d[0]
                ? String((d[0] as { msg?: string }).msg ?? d[0])
                : msg;
          msg = friendlyTelegramCreateGroupError(raw);
        } catch {
          if (errText.trim()) msg = friendlyTelegramCreateGroupError(errText.slice(0, 2000));
        }
        console.error("Telegram create-group error:", createRes.status, msg);
        return NextResponse.json({ error: msg }, { status: createRes.status >= 500 ? 502 : createRes.status });
      }
      const responseText = await createRes.text();
      let createData: {
        chat_id?: unknown;
        invited?: number[];
        failed?: { telegram_id: number; telegram_username?: string; reason: string }[];
      };
      try {
        createData = JSON.parse(responseText) as typeof createData;
      } catch (parseErr) {
        console.error(
          "Telegram create-group: JSON invalide, statut",
          createRes.status,
          "extrait:",
          responseText.slice(0, 400),
          parseErr
        );
        return NextResponse.json(
          { error: "Réponse invalide du service Telegram (JSON)." },
          { status: 502 }
        );
      }
      const parsedChatId = normalizeTelegramChatIdFromService(createData.chat_id);
      if (parsedChatId === null) {
        console.error("Telegram create-group: chat_id manquant ou invalide", createData);
        return NextResponse.json(
          { error: "Réponse invalide du service Telegram (chat_id)." },
          { status: 502 }
        );
      }
      telegramChatId = parsedChatId;
      invited = createData.invited ?? [];
      failed = createData.failed ?? [];
    }
    if (useExistingGroup) {
      const [existing] = await sql`
        SELECT ba.name AS account_name, c.name AS company_name
        FROM bank_accounts ba
        JOIN companies c ON c.id = ba.company_id
        WHERE ba.telegram_chat_id = ${telegramChatId} LIMIT 1
      `;
      if (existing) {
        const ex = existing as { account_name?: string; company_name?: string };
        const label = [ex.company_name, ex.account_name].filter(Boolean).join(" – ") || "un autre compte";
        return NextResponse.json(
          {
            error: `Ce groupe Telegram (ID ${telegramChatId}) est déjà lié à « ${label} ». Supprimez d'abord ce compte ou utilisez un autre groupe.`,
          },
          { status: 409 }
        );
      }
    }
    const rows = await sql`
      INSERT INTO bank_accounts (company_id, name, telegram_chat_id, bank_id, account_type_id, account_status_id, login, password, pin_code, plafond_limit, company_email_id, company_phone_id)
      VALUES (${company_id}::uuid, ${name}, ${telegramChatId}, ${bank_id || null}, ${account_type_id}, ${account_status_id}::uuid, ${login}, ${password}, ${pin_code}, ${plafond_limit}, ${company_email_id || null}, ${company_phone_id || null})
      RETURNING id, company_id, name, telegram_chat_id, bank_id, account_type_id, account_status_id, created_at, updated_at
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Échec de la création du compte." },
        { status: 500 }
      );
    }
    for (const item of ibanItems) {
      await sql`
        INSERT INTO bank_account_ibans (bank_account_id, iban, bic)
        VALUES (${row.id}, ${item.iban}, ${item.bic ?? null})
      `;
    }
    for (const item of cardItems) {
      await sql`
        INSERT INTO bank_account_cards (bank_account_id, numero, date_expiration, cvv)
        VALUES (${row.id}, ${item.numero}, ${item.date_expiration ?? null}, ${item.cvv ?? null})
      `;
    }
    const [full] = await sql`
      SELECT
        ba.id,
        ba.company_id,
        ba.name,
        ba.telegram_chat_id,
        ba.bank_id,
        ba.account_type_id,
        ba.account_status_id,
        ast.name AS account_status_name,
        ast.emoji AS account_status_emoji,
        ast.background_color AS account_status_background_color,
        ast.background_opacity AS account_status_background_opacity,
        ba.login,
        ba.password,
        ba.pin_code,
        ba.plafond_limit,
        b.name AS bank_name,
        at.name AS account_type_name,
        at.emoji AS account_type_emoji,
        ba.created_at,
        ba.updated_at,
        c.name AS company_name,
        0::float AS balance,
        EXISTS(SELECT 1 FROM bank_account_files baf WHERE baf.bank_account_id = ba.id AND baf.file_type = 'rib') AS has_rib,
        COALESCE(
          (SELECT json_agg(json_build_object('iban', bai.iban, 'bic', bai.bic) ORDER BY bai.created_at)
           FROM bank_account_ibans bai
           WHERE bai.bank_account_id = ba.id),
          '[]'::json
        ) AS ibans,
        COALESCE(
          (SELECT json_agg(json_build_object('numero', bac.numero, 'date_expiration', bac.date_expiration, 'cvv', bac.cvv) ORDER BY bac.created_at)
           FROM bank_account_cards bac
           WHERE bac.bank_account_id = ba.id),
          '[]'::json
        ) AS cards
      FROM bank_accounts ba
      JOIN companies c ON c.id = ba.company_id
      LEFT JOIN banks b ON b.id = ba.bank_id
      LEFT JOIN account_types at ON at.id = ba.account_type_id
      LEFT JOIN account_statuses ast ON ast.id = ba.account_status_id
      WHERE ba.id = ${row.id}
    `;
    const result = full ?? row;
    let enrichedWarnings: { telegram_id: number; name?: string; telegram_username?: string; reason: string }[] = failed;
    if (failed.length > 0) {
      const failedIds = failed.map((f) => f.telegram_id);
      try {
        const userRows =
          failedIds.length > 0
            ? await sql.query(
                `SELECT ut.telegram_id, u.name, ut.telegram_username
                 FROM user_telegram ut
                 LEFT JOIN neon_auth."user" u ON u.id = ut.user_id
                 WHERE ut.telegram_id = ANY($1::bigint[])`,
                [failedIds]
              )
            : [];
        const userRowsList = (Array.isArray(userRows) ? userRows : (userRows as { rows?: unknown[] }).rows ?? []) as {
          telegram_id: string | number;
          name?: string;
          telegram_username?: string;
        }[];
        const byId = new Map(userRowsList.map((r) => [Number(r.telegram_id), r]));
        enrichedWarnings = failed.map((f) => ({
          telegram_id: f.telegram_id,
          name: byId.get(f.telegram_id)?.name ?? undefined,
          telegram_username: f.telegram_username ?? byId.get(f.telegram_id)?.telegram_username ?? undefined,
          reason: f.reason,
        }));
      } catch (enrichErr) {
        console.error("POST /api/bank-accounts: enrichment des invitations Telegram ignorée:", enrichErr);
        enrichedWarnings = failed;
      }
    }
    const payload =
      failed.length > 0
        ? {
            ...result,
            telegram_invite_warnings: enrichedWarnings,
          }
        : result;
    return NextResponse.json(jsonSafeForResponse(payload));
  } catch (error) {
    console.error("POST /api/bank-accounts error:", error);
    const pgErr = error as { code?: string; constraint?: string };
    if (pgErr?.code === "23505" && pgErr?.constraint === "ix_bank_accounts_telegram_chat_id") {
      return NextResponse.json(
        { error: "Ce groupe Telegram est déjà lié à un autre compte. Supprimez d'abord ce compte ou utilisez un autre groupe." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Échec de la création du compte bancaire." },
      { status: 500 }
    );
  }
}
