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
        COALESCE(
          (SELECT array_agg(bai.iban ORDER BY bai.created_at)
           FROM bank_account_ibans bai
           WHERE bai.bank_account_id = ba.id),
          ARRAY[]::text[]
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
    const ibans: string[] = Array.isArray(ibansRaw)
      ? ibansRaw
          .map((v: unknown) => (typeof v === "string" ? v.trim().replace(/\s/g, "").toUpperCase() : ""))
          .filter((v: string) => v.length > 0)
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
      SELECT id, name FROM companies WHERE id = ${company_id}::uuid LIMIT 1
    `;
    if (!company) {
      return NextResponse.json(
        { error: "Société introuvable." },
        { status: 404 }
      );
    }
    if (bank_id) {
      const [bank] = await sql`SELECT id FROM banks WHERE id = ${bank_id}::uuid LIMIT 1`;
      if (!bank) {
        return NextResponse.json(
          { error: "Banque introuvable." },
          { status: 404 }
        );
      }
    }
    const title = company.name !== name ? `${company.name} – ${name}` : name;

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

    const createRes = await fetch(`${serviceUrl.replace(/\/$/, "")}/create-group`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ title, users }),
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
    for (const iban of ibans) {
      await sql`
        INSERT INTO bank_account_ibans (bank_account_id, iban)
        VALUES (${row.id}, ${iban})
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
          (SELECT array_agg(bai.iban ORDER BY bai.created_at)
           FROM bank_account_ibans bai
           WHERE bai.bank_account_id = ba.id),
          ARRAY[]::text[]
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
