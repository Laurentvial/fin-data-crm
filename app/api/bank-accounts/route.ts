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
        ba.created_at,
        ba.updated_at,
        c.name AS company_name,
        COALESCE(SUM(CASE WHEN t.type = 'DEBIT' THEN -t.amount ELSE t.amount END), 0)::float AS balance
      FROM bank_accounts ba
      JOIN companies c ON c.id = ba.company_id
      LEFT JOIN transactions t ON t.bank_account_id = ba.id
      GROUP BY ba.id, ba.company_id, ba.name, ba.telegram_chat_id, ba.created_at, ba.updated_at, c.name
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
