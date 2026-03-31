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
        ba.account_type_id,
        ba.account_status_id,
        ba.login,
        ba.password,
        ba.pin_code,
        ba.plafond_limit,
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
        c.source_id AS company_source_id,
        src.name AS company_source_name,
        c.fournisseur AS company_fournisseur,
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
      LEFT JOIN banks b ON b.id = ba.bank_id
      LEFT JOIN account_types at ON at.id = ba.account_type_id
      LEFT JOIN account_statuses ast ON ast.id = ba.account_status_id
      LEFT JOIN transactions t ON t.bank_account_id = ba.id
      WHERE ba.company_id = ${id}
      GROUP BY ba.id, ba.company_id, ba.name, ba.telegram_chat_id, ba.bank_id, ba.account_type_id, ba.account_status_id, ba.login, ba.password, ba.pin_code, ba.plafond_limit, b.name, at.name, at.emoji, ast.name, ast.emoji, ast.background_color, ast.background_opacity, ba.created_at, ba.updated_at, c.name, c.source_id, src.name, c.fournisseur
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
