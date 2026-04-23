import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/**
 * GET — débits candidats pour crédit interne : tous comptes / toutes sociétés,
 * même montant que le crédit, date à ±7 j, autre compte que le crédit, pas déjà lié.
 * Query: credit_id=uuid (transaction source, type CREDIT)
 */
export async function GET(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const creditId = searchParams.get("credit_id") ?? "";
    if (!creditId || !UUID_RE.test(creditId)) {
      return NextResponse.json({ error: "credit_id invalide (UUID attendu)" }, { status: 400 });
    }

    const metaRows = await sql`
      SELECT t.type
      FROM transactions t
      WHERE t.id = ${creditId}::uuid
      LIMIT 1
    `;
    const meta = Array.isArray(metaRows) ? metaRows[0] : metaRows;
    if (!meta) {
      return NextResponse.json({ error: "Transaction introuvable" }, { status: 404 });
    }
    if (String((meta as { type: string }).type) !== "CREDIT") {
      return NextResponse.json(
        { error: "Seuls les crédits classiques peuvent être appariés (type CREDIT)." },
        { status: 400 }
      );
    }

    const rows = await sql`
      WITH cr AS (
        SELECT t.bank_account_id, t.transaction_date, t.amount
        FROM transactions t
        WHERE t.id = ${creditId}::uuid
      )
      SELECT
        t.id,
        t.bank_account_id,
        t.transaction_date,
        t.amount,
        t.description,
        t.type,
        t.fournisseur_id,
        fn.name AS fournisseur_name,
        ba.name AS bank_account_name,
        c2.name AS company_name,
        b.name AS bank_name
      FROM transactions t
      JOIN bank_accounts ba ON ba.id::text = t.bank_account_id::text
      JOIN cr ON true
      LEFT JOIN companies c2 ON c2.id::text = ba.company_id::text
      LEFT JOIN banks b ON b.id = ba.bank_id
      LEFT JOIN fournisseurs fn ON fn.id = t.fournisseur_id
      WHERE t.type = 'DEBIT'::transactiontype
        AND t.bank_account_id::text <> cr.bank_account_id::text
        AND t.amount::numeric = cr.amount::numeric
        AND ABS((t.transaction_date - cr.transaction_date)) <= 7
        AND NOT EXISTS (
          SELECT 1 FROM transactions ic
          WHERE ic.internal_transfer_debit_id = t.id
        )
      ORDER BY ABS((t.transaction_date - cr.transaction_date)), t.created_at DESC
      LIMIT 50
    `;

    const list = Array.isArray(rows) ? rows : rows != null ? [rows] : [];
    return NextResponse.json({ candidates: list });
  } catch (error) {
    console.error("GET /api/transactions/internal-transfer-candidates:", error);
    return NextResponse.json({ error: "Échec du chargement des candidats." }, { status: 500 });
  }
}
