import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { isAppSuperAdmin } from "@/lib/app-super-admin";
import { sql } from "@/lib/db";

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export async function GET(request: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  if (!(await isAppSuperAdmin(session.user.id))) {
    return NextResponse.json(
      { error: "Accès réservé aux super-administrateurs." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const date_from = searchParams.get("date_from") ?? "";
  const date_to = searchParams.get("date_to") ?? "";
  const client_account_type_id = searchParams.get("client_account_type_id") || null;
  const bank_id = searchParams.get("bank_id") || null;

  if (!isValidDate(date_from) || !isValidDate(date_to)) {
    return NextResponse.json(
      { error: "date_from et date_to requis (format YYYY-MM-DD)." },
      { status: 400 }
    );
  }

  try {
    const rows = await sql`
      SELECT
        COALESCE(SUM(CASE WHEN t.type = 'CREDIT'::transactiontype THEN t.amount::numeric ELSE 0 END), 0)::float AS chiffre_affaires,
        COALESCE(SUM(CASE WHEN t.type = 'DEBIT'::transactiontype THEN t.amount::numeric ELSE 0 END), 0)::float AS debits_total,
        COUNT(*) FILTER (WHERE t.type = 'CREDIT'::transactiontype)::int AS credits_count,
        COUNT(*) FILTER (WHERE t.type = 'DEBIT'::transactiontype)::int AS debits_count
      FROM transactions t
      LEFT JOIN bank_accounts ba ON ba.id::text = t.bank_account_id::text
      LEFT JOIN banks b ON b.id = ba.bank_id
      WHERE t.transaction_date >= ${date_from}::date
        AND t.transaction_date <= ${date_to}::date
        AND (
          (${bank_id})::text IS NULL
          OR ba.bank_id::text = (${bank_id})::text
        )
        AND (
          (${client_account_type_id})::text IS NULL
          OR COALESCE(t.client_account_type_id, ba.account_type_id)::text = (${client_account_type_id})::text
        )
    `;
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row || typeof row !== "object") {
      return NextResponse.json(
        {
          chiffre_affaires: 0,
          debits_total: 0,
          credits_count: 0,
          debits_count: 0,
          date_from,
          date_to,
        },
        { status: 200 }
      );
    }
    const r = row as {
      chiffre_affaires: number;
      debits_total: number;
      credits_count: number;
      debits_count: number;
    };
    return NextResponse.json({
      chiffre_affaires: Math.round(Number(r.chiffre_affaires) * 100) / 100,
      debits_total: Math.round(Number(r.debits_total) * 100) / 100,
      credits_count: Number(r.credits_count),
      debits_count: Number(r.debits_count),
      date_from,
      date_to,
    });
  } catch (e) {
    console.error("GET /api/reporting/financial-summary:", e);
    return NextResponse.json({ error: "Échec du calcul des statistiques." }, { status: 500 });
  }
}
