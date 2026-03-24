import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import type { TransactionType } from "@/lib/types";

const TRANSACTION_TYPES: TransactionType[] = ["DEBIT", "CREDIT"];

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

function isValidDate(s: string): boolean {
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && s.match(/^\d{4}-\d{2}-\d{2}$/) !== null;
}

export async function POST(request: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez vous reconnecter." },
      { status: 401 }
    );
  }
  try {
    const body = await request.json();
    const bank_account_id = body.bank_account_id ?? body.company_id;
    const transaction_date = body.transaction_date;
    const amount = body.amount;
    const description = body.description ?? "";
    const type = body.type ?? "DEBIT";

    if (!bank_account_id || typeof bank_account_id !== "string") {
      return NextResponse.json({ error: "bank_account_id est requis" }, { status: 400 });
    }
    if (!transaction_date || typeof transaction_date !== "string" || !isValidDate(transaction_date)) {
      return NextResponse.json({ error: "transaction_date invalide (format YYYY-MM-DD)" }, { status: 400 });
    }
    const n = Number(amount);
    if (Number.isNaN(n) || n <= 0) {
      return NextResponse.json({ error: "amount invalide (nombre positif)" }, { status: 400 });
    }
    if (!TRANSACTION_TYPES.includes(type)) {
      return NextResponse.json({ error: "type invalide (DEBIT ou CREDIT)" }, { status: 400 });
    }

    // processed_by_user_id is bigint (Telegram ID) - shared with Python service
    const telegramRow = await sql`
      SELECT telegram_id FROM user_telegram WHERE user_id = ${session.user.id}::uuid
    `;
    const telegramId = Array.isArray(telegramRow) ? telegramRow[0]?.telegram_id : (telegramRow as { telegram_id?: number })?.telegram_id;
    const processedByUserId = telegramId != null ? Number(telegramId) : null;

    const rows = await sql`
      INSERT INTO transactions (bank_account_id, transaction_date, amount, description, type, processed_by_user_id)
      VALUES (${bank_account_id}::uuid, ${transaction_date}::date, ${n}, ${description}, ${type}::transactiontype, ${processedByUserId})
      RETURNING id, bank_account_id, transaction_date, amount, description, type, raw_image_path, extracted_data_json, created_at, processed_by_user_id
    `;
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) {
      return NextResponse.json({ error: "Échec de l'insertion" }, { status: 500 });
    }

    const withAccount = await sql`
      SELECT t.id, t.bank_account_id, t.transaction_date, t.amount, t.description, t.type,
        t.raw_image_path, t.extracted_data_json, t.created_at, t.processed_by_user_id,
        t.fournisseur_id, fn.name AS fournisseur_name,
        COALESCE(pu.name, ut.telegram_username) AS processed_by_user_name,
        ba.name AS bank_account_name,
        c.name AS company_name
      FROM transactions t
      LEFT JOIN fournisseurs fn ON fn.id = t.fournisseur_id
      LEFT JOIN bank_accounts ba ON ba.id::text = t.bank_account_id::text
      LEFT JOIN companies c ON c.id::text = ba.company_id::text
      LEFT JOIN user_telegram ut ON ut.telegram_id = t.processed_by_user_id
      LEFT JOIN neon_auth."user" pu ON pu.id = ut.user_id
      WHERE t.id = ${row.id}::uuid
    `;
    const full = Array.isArray(withAccount) ? withAccount[0] : withAccount;
    return NextResponse.json(full ?? row);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("uix_bank_account_transaction") || msg.includes("uix_company_transaction") || msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        { error: "Une transaction identique existe déjà (société, date, montant, description)" },
        { status: 409 }
      );
    }
    if (msg.includes("foreign key") || msg.includes("bank_account_id")) {
      return NextResponse.json({ error: "Compte bancaire introuvable" }, { status: 400 });
    }
    console.error("POST /api/transactions error:", err);
    return NextResponse.json({ error: "Échec de la création" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const bank_account_id = searchParams.get("bank_account_id") ?? searchParams.get("company_id") ?? null;
    const date_from = searchParams.get("date_from") || null;
    const date_to = searchParams.get("date_to") || null;
    const type = searchParams.get("type") || null;
    const limit = Math.min(Number(searchParams.get("limit")) || 500, 1000);
    const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

    const [rows, balanceRows] = await Promise.all([
      sql`
        SELECT
          t.id,
          t.bank_account_id,
          t.transaction_date,
          t.amount,
          t.description,
          t.type,
          t.raw_image_path,
          t.extracted_data_json,
          t.created_at,
          t.processed_by_user_id,
          t.fournisseur_id,
          fn.name AS fournisseur_name,
          COALESCE(pu.name, ut.telegram_username) AS processed_by_user_name,
          ba.name AS bank_account_name,
          ba.company_id,
          c.name AS company_name,
          i.invoice_id,
          i.invoice_pdf_url
        FROM transactions t
        LEFT JOIN fournisseurs fn ON fn.id = t.fournisseur_id
        LEFT JOIN bank_accounts ba ON ba.id::text = t.bank_account_id::text
        LEFT JOIN companies c ON c.id::text = ba.company_id::text
        LEFT JOIN user_telegram ut ON ut.telegram_id = t.processed_by_user_id
        LEFT JOIN neon_auth."user" pu ON pu.id = ut.user_id
        LEFT JOIN LATERAL (
          SELECT id AS invoice_id, pdf_url AS invoice_pdf_url
          FROM invoices
          WHERE transaction_id::text = t.id::text
          ORDER BY created_at DESC
          LIMIT 1
        ) i ON true
        WHERE
          ((${bank_account_id})::text IS NULL OR t.bank_account_id::text = (${bank_account_id})::text)
          AND ((${date_from})::date IS NULL OR t.transaction_date >= (${date_from})::date)
          AND ((${date_to})::date IS NULL OR t.transaction_date <= (${date_to})::date)
          AND ((${type})::text IS NULL OR t.type::text = (${type})::text)
        ORDER BY t.transaction_date DESC, t.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `,
      sql`
        SELECT COALESCE(SUM(
          CASE WHEN t.type = 'DEBIT' THEN -(t.amount::numeric) ELSE t.amount::numeric END
        ), 0)::float AS total_balance
        FROM transactions t
        WHERE
          ((${bank_account_id})::text IS NULL OR t.bank_account_id::text = (${bank_account_id})::text)
          AND ((${date_from})::date IS NULL OR t.transaction_date >= (${date_from})::date)
          AND ((${date_to})::date IS NULL OR t.transaction_date <= (${date_to})::date)
          AND ((${type})::text IS NULL OR t.type::text = (${type})::text)
      `,
    ]);

    const totalBalance =
      Array.isArray(balanceRows) && balanceRows[0] != null
        ? Number((balanceRows[0] as { total_balance: number }).total_balance)
        : 0;
    const roundedBalance = Math.round(totalBalance * 100) / 100;

    const rowList = Array.isArray(rows) ? rows : rows != null ? [rows] : [];
    const hasMore = rowList.length === limit;

    return NextResponse.json({
      transactions: rows,
      total_balance: roundedBalance,
      has_more: hasMore,
    });
  } catch (error) {
    console.error("GET /api/transactions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
