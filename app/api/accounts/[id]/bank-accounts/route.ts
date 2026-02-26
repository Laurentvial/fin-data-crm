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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id } = await params;
  try {
    const companyCheck = await sql`
      SELECT 1 FROM companies WHERE id = ${id} LIMIT 1
    `;
    if (companyCheck.length === 0) {
      return NextResponse.json(
        { error: "Société introuvable." },
        { status: 404 }
      );
    }
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
      WHERE ba.company_id = ${id}
      GROUP BY ba.id, ba.company_id, ba.name, ba.telegram_chat_id, ba.bank_id, b.name, ba.created_at, ba.updated_at, c.name
      ORDER BY ba.name
    `;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/accounts/[id]/bank-accounts error:", error);
    return NextResponse.json(
      { error: "Échec du chargement des comptes." },
      { status: 500 }
    );
  }
}
