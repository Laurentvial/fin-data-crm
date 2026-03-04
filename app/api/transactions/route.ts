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
  const authError = await requireAuth();
  if (authError) return authError;
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

    const rows = await sql`
      INSERT INTO transactions (bank_account_id, transaction_date, amount, description, type)
      VALUES (${bank_account_id}::uuid, ${transaction_date}::date, ${n}, ${description}, ${type}::transactiontype)
      RETURNING id, bank_account_id, transaction_date, amount, description, type, raw_image_path, extracted_data_json, created_at, processed_by_user_id
    `;
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) {
      return NextResponse.json({ error: "Échec de l'insertion" }, { status: 500 });
    }

    const withAccount = await sql`
      SELECT t.id, t.bank_account_id, t.transaction_date, t.amount, t.description, t.type,
        t.raw_image_path, t.extracted_data_json, t.created_at, t.processed_by_user_id,
        ba.name AS bank_account_name,
        c.name AS company_name
      FROM transactions t
      LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
      LEFT JOIN companies c ON c.id = ba.company_id
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
    const offset = Number(searchParams.get("offset")) || 0;

    const rows = await sql`
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
        ba.name AS bank_account_name,
        c.name AS company_name,
        i.invoice_id,
        i.invoice_pdf_url
      FROM transactions t
      LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
      LEFT JOIN companies c ON c.id = ba.company_id
      LEFT JOIN LATERAL (
        SELECT id AS invoice_id, pdf_url AS invoice_pdf_url
        FROM invoices
        WHERE transaction_id = t.id
        ORDER BY created_at DESC
        LIMIT 1
      ) i ON true
      WHERE
        (${bank_account_id}::uuid IS NULL OR t.bank_account_id = ${bank_account_id}::uuid)
        AND (${date_from}::date IS NULL OR t.transaction_date >= ${date_from}::date)
        AND (${date_to}::date IS NULL OR t.transaction_date <= ${date_to}::date)
        AND (${type}::text IS NULL OR t.type::text = ${type})
      ORDER BY t.transaction_date DESC, t.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/transactions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
