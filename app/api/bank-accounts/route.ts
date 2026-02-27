import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";

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
        b.name AS bank_name,
        ba.created_at,
        ba.updated_at,
        c.name AS company_name,
        COALESCE(SUM(CASE WHEN t.type = 'DEBIT' THEN -t.amount ELSE t.amount END), 0)::float AS balance,
        EXISTS(SELECT 1 FROM bank_files bf WHERE bf.bank_id = ba.bank_id AND bf.file_type = 'logo') AS has_logo,
        COALESCE(
          (SELECT json_agg(json_build_object('iban', bai.iban, 'bic', bai.bic) ORDER BY bai.created_at)
           FROM bank_account_ibans bai
           WHERE bai.bank_account_id = ba.id),
          '[]'::json
        ) AS ibans
      FROM bank_accounts ba
      JOIN companies c ON c.id = ba.company_id
      LEFT JOIN banks b ON b.id = ba.bank_id
      LEFT JOIN transactions t ON t.bank_account_id = ba.id
      GROUP BY ba.id, ba.company_id, ba.name, ba.telegram_chat_id, ba.bank_id, b.name, ba.created_at, ba.updated_at, c.name
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
  const serviceUrl = process.env.TELEGRAM_GROUP_SERVICE_URL;
  const apiKey = process.env.TELEGRAM_SERVICE_API_KEY;
  if (!serviceUrl || !apiKey) {
    return NextResponse.json(
      { error: "Service Telegram non configuré (TELEGRAM_GROUP_SERVICE_URL, TELEGRAM_SERVICE_API_KEY)." },
      { status: 503 }
    );
  }
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const company_id = typeof body?.company_id === "string" ? body.company_id.trim() : "";
    const bank_id = typeof body?.bank_id === "string" ? body.bank_id.trim() : null;
    const ibansRaw = body?.ibans;
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
      SELECT id, name, address, siret FROM companies WHERE id = ${company_id}::uuid LIMIT 1
    `;
    if (!company) {
      return NextResponse.json(
        { error: "Société introuvable." },
        { status: 404 }
      );
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
    const emailRows = await sql`
      SELECT email FROM company_emails WHERE company_id = ${company_id}::uuid ORDER BY email
    `;
    const emails = emailRows.map((r) => r.email as string);
    const [kbisRow] = await sql`
      SELECT filename, content_type, data_base64
      FROM company_files
      WHERE company_id = ${company_id}::uuid AND file_type = 'kbis'
      LIMIT 1
    `;
    const title = company.name !== name ? `${company.name} – ${name}` : name;

    const ibanStr =
      ibanItems.length > 0
        ? ibanItems.map((i) => (i.bic ? `${i.iban} (BIC: ${i.bic})` : i.iban)).join(", ")
        : "—";
    const emailStr = emails.length > 0 ? emails.join(", ") : "—";
    const welcomeMessage = `NOM STE : ${company.name}
ADRESSE : ${(company.address as string) ?? "—"}
Email : ${emailStr}
SIRET : ${(company.siret as string) ?? "—"}
IBAN : ${ibanStr}
BANQUE : ${bankName ?? "—"}`;

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
    } = {
      title,
      users,
      welcome_message: welcomeMessage,
    };
    if (logoBase64 && logoContentType) {
      createGroupBody.logo_base64 = logoBase64;
      createGroupBody.logo_content_type = logoContentType;
    }
    if (kbisRow && typeof kbisRow.data_base64 === "string") {
      createGroupBody.kbis_base64 = kbisRow.data_base64 as string;
      createGroupBody.kbis_content_type = (kbisRow.content_type as string) || "application/pdf";
      if (typeof kbisRow.filename === "string" && kbisRow.filename) {
        createGroupBody.kbis_filename = kbisRow.filename;
      }
    }
    const createRes = await fetch(`${serviceUrl.replace(/\/$/, "")}/create-group`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(createGroupBody),
    });
    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      const msg = errData.detail ?? "Impossible de créer le groupe Telegram";
      return NextResponse.json(
        { error: typeof msg === "string" ? msg : "Impossible de créer le groupe Telegram" },
        { status: createRes.status >= 500 ? 502 : createRes.status }
      );
    }
    const createData = (await createRes.json()) as {
      chat_id: number;
      invited?: number[];
      failed?: { telegram_id: number; telegram_username?: string; reason: string }[];
    };
    const { chat_id, invited = [], failed = [] } = createData;
    if (typeof chat_id !== "number") {
      return NextResponse.json(
        { error: "Réponse invalide du service Telegram." },
        { status: 502 }
      );
    }
    const rows = await sql`
      INSERT INTO bank_accounts (company_id, name, telegram_chat_id, bank_id)
      VALUES (${company_id}::uuid, ${name}, ${chat_id}, ${bank_id || null})
      RETURNING id, company_id, name, telegram_chat_id, bank_id, created_at, updated_at
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
    const [full] = await sql`
      SELECT
        ba.id,
        ba.company_id,
        ba.name,
        ba.telegram_chat_id,
        ba.bank_id,
        b.name AS bank_name,
        ba.created_at,
        ba.updated_at,
        c.name AS company_name,
        0::float AS balance,
        COALESCE(
          (SELECT json_agg(json_build_object('iban', bai.iban, 'bic', bai.bic) ORDER BY bai.created_at)
           FROM bank_account_ibans bai
           WHERE bai.bank_account_id = ba.id),
          '[]'::json
        ) AS ibans
      FROM bank_accounts ba
      JOIN companies c ON c.id = ba.company_id
      LEFT JOIN banks b ON b.id = ba.bank_id
      WHERE ba.id = ${row.id}
    `;
    const result = full ?? row;
    let enrichedWarnings: { telegram_id: number; name?: string; telegram_username?: string; reason: string }[] = failed;
    if (failed.length > 0) {
      const failedIds = failed.map((f) => f.telegram_id);
      const userRows =
        failedIds.length > 0
          ? ((await sql.query(
              `SELECT ut.telegram_id, u.name, ut.telegram_username
               FROM user_telegram ut
               LEFT JOIN neon_auth."user" u ON u.id = ut.user_id
               WHERE ut.telegram_id = ANY($1::bigint[])`,
              [failedIds]
            )) as { rows?: unknown[] })
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
    }
    const payload =
      failed.length > 0
        ? {
            ...result,
            telegram_invite_warnings: enrichedWarnings,
          }
        : result;
    return NextResponse.json(payload);
  } catch (error) {
    console.error("POST /api/bank-accounts error:", error);
    return NextResponse.json(
      { error: "Échec de la création du compte bancaire." },
      { status: 500 }
    );
  }
}
