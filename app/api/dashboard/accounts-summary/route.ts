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
    const recentAccountIds = await sql`
      WITH ranked AS (
        SELECT bank_account_id,
          ROW_NUMBER() OVER (ORDER BY MAX(transaction_date) DESC, MAX(created_at) DESC) AS rn
        FROM transactions
        GROUP BY bank_account_id
      )
      SELECT bank_account_id FROM ranked WHERE rn <= 12
    `;
    const ids = (recentAccountIds as { bank_account_id: string }[]).map(
      (r) => r.bank_account_id
    );
    if (ids.length === 0) {
      return NextResponse.json([]);
    }

    const accounts = await sql`
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
      WHERE ba.id = ANY(${ids})
      GROUP BY ba.id, ba.company_id, ba.name, ba.telegram_chat_id, ba.bank_id, b.name, ba.created_at, ba.updated_at, c.name
    `;

    const txRows = await sql`
      WITH ranked AS (
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
          ROW_NUMBER() OVER (PARTITION BY t.bank_account_id ORDER BY t.transaction_date DESC, t.created_at DESC) AS rn
        FROM transactions t
        LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
        LEFT JOIN companies c ON c.id = ba.company_id
        WHERE t.bank_account_id = ANY(${ids})
      )
      SELECT id, bank_account_id, transaction_date, amount, description, type,
        raw_image_path, extracted_data_json, created_at, processed_by_user_id,
        bank_account_name, company_name
      FROM ranked WHERE rn <= 5
    `;

    const txByAccount: Record<string, typeof txRows> = {};
    for (const tx of txRows as {
      id: string;
      bank_account_id: string;
      transaction_date: string;
      amount: string;
      description: string;
      type: string;
      raw_image_path: string | null;
      extracted_data_json: unknown;
      created_at: string;
      processed_by_user_id: string | null;
      bank_account_name?: string;
      company_name?: string;
    }[]) {
      const aid = tx.bank_account_id;
      if (!txByAccount[aid]) txByAccount[aid] = [];
      txByAccount[aid].push(tx);
    }

    const orderMap = new Map(ids.map((id, i) => [id, i]));
    const result = (accounts as Record<string, unknown>[]).map((acc) => ({
      ...acc,
      transactions: txByAccount[acc.id as string] ?? [],
    })) as Array<{ id: string; transactions: (typeof txByAccount)[string] }>;
    result.sort(
      (a, b) =>
        (orderMap.get(a.id as string) ?? 999) -
        (orderMap.get(b.id as string) ?? 999)
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/dashboard/accounts-summary error:", error);
    return NextResponse.json(
      { error: "Échec du chargement du tableau de bord." },
      { status: 500 }
    );
  }
}
