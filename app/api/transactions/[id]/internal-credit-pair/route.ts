import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { canMutate } from "@/lib/auth/permissions";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapPairError(msg: string): string | null {
  if (msg.includes("credit_not_found")) return "Transaction crédit introuvable.";
  if (msg.includes("debit_not_found")) return "Transaction débit introuvable.";
  if (msg.includes("credit_must_be_credit_type")) return "Seul un crédit classique peut devenir crédit interne.";
  if (msg.includes("counterpart_must_be_debit")) return "La contrepartie doit être un débit.";
  if (msg.includes("same_bank_account")) return "Le débit doit être sur un autre compte bancaire.";
  if (msg.includes("amount_mismatch")) return "Les montants des deux transactions doivent être identiques.";
  if (msg.includes("date_out_of_range")) return "Écart de date trop important (max. 7 jours).";
  if (msg.includes("debit_already_paired")) return "Ce débit est déjà lié à un autre crédit interne.";
  if (msg.includes("fournisseur_not_found")) return "Fournisseur introuvable.";
  if (msg.includes("invalid_pair_same_id")) return "Paire invalide.";
  if (msg.includes("unique") || msg.includes("duplicate")) {
    return "Ce débit est déjà lié à un autre crédit interne.";
  }
  return null;
}

/**
 * POST — passe la ligne crédit en INTERNAL_CREDIT, lie le débit miroir et aligne les fournisseurs.
 * Body: { debit_id: uuid, fournisseur_id?: uuid | null }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez vous reconnecter." },
      { status: 401 }
    );
  }
  if (!canMutate(session.user.role)) {
    return NextResponse.json(
      { error: "Accès refusé: rôle lecteur en lecture seule." },
      { status: 403 }
    );
  }

  try {
    const { id: creditId } = await params;
    if (!creditId || !UUID_RE.test(creditId)) {
      return NextResponse.json({ error: "ID crédit invalide" }, { status: 400 });
    }

    const body = await request.json();
    const debitId = typeof body.debit_id === "string" ? body.debit_id : "";
    if (!debitId || !UUID_RE.test(debitId)) {
      return NextResponse.json({ error: "debit_id invalide (UUID attendu)" }, { status: 400 });
    }

    let fournisseurUuid: string | null = null;
    const rawF = body.fournisseur_id;
    if (rawF !== undefined && rawF !== null && rawF !== "") {
      if (typeof rawF !== "string" || !UUID_RE.test(rawF)) {
        return NextResponse.json({ error: "fournisseur_id invalide (UUID attendu)" }, { status: 400 });
      }
      fournisseurUuid = rawF;
    }

    try {
      await sql.query("SELECT apply_internal_credit_pair($1::uuid, $2::uuid, $3::uuid)", [
        creditId,
        debitId,
        fournisseurUuid,
      ]);
      await sql`
        UPDATE transactions
        SET credit_status = NULL
        WHERE id = ${creditId}::uuid
      `;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const mapped = mapPairError(msg);
      if (mapped) {
        return NextResponse.json({ error: mapped }, { status: 400 });
      }
      console.error("apply_internal_credit_pair:", e);
      return NextResponse.json({ error: "Échec de l’appariement." }, { status: 500 });
    }

    const fullRows = await sql`
      SELECT
        t.id,
        t.bank_account_id,
        t.transaction_date,
        t.amount,
        t.description,
        t.type,
        t.internal_transfer_debit_id,
        t.raw_image_path,
        t.extracted_data_json,
        t.created_at,
        t.processed_by_user_id,
        t.debit_status,
        t.credit_status,
        t.fournisseur_id,
        fn.name AS fournisseur_name,
        t.client_account_type_id,
        bat.name AS bank_account_type_name,
        atc.name AS client_name,
        COALESCE(pu.name, ut.telegram_username) AS processed_by_user_name,
        ba.name AS bank_account_name,
        ba.company_id,
        c.name AS company_name,
        b.name AS bank_name,
        acc_st.name AS account_status_name,
        acc_st.emoji AS account_status_emoji,
        i.invoice_id,
        i.invoice_pdf_url,
        i.invoice_number
      FROM transactions t
      LEFT JOIN fournisseurs fn ON fn.id = t.fournisseur_id
      LEFT JOIN bank_accounts ba ON ba.id::text = t.bank_account_id::text
      LEFT JOIN banks b ON b.id = ba.bank_id
      LEFT JOIN account_statuses acc_st ON acc_st.id = ba.account_status_id
      LEFT JOIN account_types atc ON atc.id = COALESCE(t.client_account_type_id, ba.account_type_id)
      LEFT JOIN account_types bat ON bat.id = ba.account_type_id
      LEFT JOIN companies c ON c.id::text = ba.company_id::text
      LEFT JOIN user_telegram ut ON ut.telegram_id = t.processed_by_user_id
      LEFT JOIN neon_auth."user" pu ON pu.id = ut.user_id
      LEFT JOIN LATERAL (
        SELECT u.id AS invoice_id, u.pdf_url AS invoice_pdf_url, u.invoice_number AS invoice_number
        FROM (
          SELECT i.id, i.pdf_url, i.invoice_number, i.created_at
          FROM invoices i
          WHERE i.transaction_id::text = t.id::text
          UNION
          SELECT i2.id, i2.pdf_url, i2.invoice_number, i2.created_at
          FROM invoice_transactions it2
          JOIN invoices i2 ON i2.id = it2.invoice_id
          WHERE it2.transaction_id::text = t.id::text
        ) u
        ORDER BY u.created_at DESC
        LIMIT 1
      ) i ON true
      WHERE t.id = ${creditId}::uuid
    `;
    const full = Array.isArray(fullRows) ? fullRows[0] : fullRows;
    if (!full) {
      return NextResponse.json({ error: "Transaction introuvable après mise à jour" }, { status: 404 });
    }
    return NextResponse.json(full);
  } catch (error) {
    console.error("POST /api/transactions/[id]/internal-credit-pair:", error);
    return NextResponse.json({ error: "Échec de l’appariement." }, { status: 500 });
  }
}
