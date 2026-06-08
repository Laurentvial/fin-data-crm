import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { canMutate } from "@/lib/auth/permissions";
import { sql } from "@/lib/db";
import { isDebitTransactionStatus } from "@/lib/debit-status";
import { isCreditTransactionStatus } from "@/lib/credit-status";
import { isSpendingCategory } from "@/lib/spending-category";
import type { TransactionType } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Types modifiables via PATCH (INTERNAL_CREDIT : route dédiée `internal-credit-pair`). */
const PATCHABLE_TRANSACTION_TYPES: TransactionType[] = ["DEBIT", "CREDIT"];

function isValidDate(s: string): boolean {
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && s.match(/^\d{4}-\d{2}-\d{2}$/) !== null;
}

export async function PATCH(
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
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (body.transaction_date !== undefined) {
      if (typeof body.transaction_date !== "string" || !isValidDate(body.transaction_date)) {
        return NextResponse.json(
          { error: "Invalid transaction_date (expected YYYY-MM-DD)" },
          { status: 400 }
        );
      }
      updates.transaction_date = body.transaction_date;
    }
    if (body.amount !== undefined) {
      const n = Number(body.amount);
      if (Number.isNaN(n)) {
        return NextResponse.json(
          { error: "Invalid amount (expected number)" },
          { status: 400 }
        );
      }
      updates.amount = n;
    }
    if (body.description !== undefined) {
      if (typeof body.description !== "string") {
        return NextResponse.json(
          { error: "Invalid description (expected string)" },
          { status: 400 }
        );
      }
      updates.description = body.description;
    }
    if (body.type !== undefined) {
      if (body.type === "INTERNAL_CREDIT") {
        return NextResponse.json(
          {
            error:
              "Utilisez la sélection « Crédit interne » dans le tableau et le modal d’appariement (POST internal-credit-pair).",
          },
          { status: 400 }
        );
      }
      if (!PATCHABLE_TRANSACTION_TYPES.includes(body.type)) {
        return NextResponse.json(
          { error: "Invalid type (expected DEBIT or CREDIT)" },
          { status: 400 }
        );
      }
      updates.type = body.type;
    }
    if (body.fournisseur_id !== undefined) {
      const v = body.fournisseur_id;
      if (v === null || v === "") {
        updates.fournisseur_id = null;
      } else if (typeof v === "string") {
        const uuidRe =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRe.test(v)) {
          return NextResponse.json(
            { error: "fournisseur_id invalide (UUID attendu)" },
            { status: 400 }
          );
        }
        const found = await sql`
          SELECT 1 AS ok FROM fournisseurs WHERE id = ${v}::uuid LIMIT 1
        `;
        const ok = Array.isArray(found) ? found[0] : found;
        if (!ok) {
          return NextResponse.json(
            { error: "Fournisseur introuvable" },
            { status: 400 }
          );
        }
        updates.fournisseur_id = v;
      } else {
        return NextResponse.json(
          { error: "fournisseur_id invalide" },
          { status: 400 }
        );
      }
    }
    if (body.client_account_type_id !== undefined) {
      const v = body.client_account_type_id;
      if (v === null || v === "") {
        updates.client_account_type_id = null;
      } else if (typeof v === "string") {
        const uuidRe =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRe.test(v)) {
          return NextResponse.json(
            { error: "client_account_type_id invalide (UUID attendu)" },
            { status: 400 }
          );
        }
        const found = await sql`
          SELECT 1 AS ok FROM account_types WHERE id = ${v}::uuid LIMIT 1
        `;
        const ok = Array.isArray(found) ? found[0] : found;
        if (!ok) {
          return NextResponse.json(
            { error: "Client introuvable (Paramètres › Clients)" },
            { status: 400 }
          );
        }
        updates.client_account_type_id = v;
      } else {
        return NextResponse.json(
          { error: "client_account_type_id invalide" },
          { status: 400 }
        );
      }
    }
    if (body.debit_status !== undefined) {
      const v = body.debit_status;
      if (v === null || v === "") {
        updates.debit_status = null;
      } else if (typeof v === "string") {
        if (!isDebitTransactionStatus(v)) {
          return NextResponse.json(
            { error: "debit_status invalide (ok, a_verifier, annulee_bloquee ou vide)" },
            { status: 400 }
          );
        }
        updates.debit_status = v;
      } else {
        return NextResponse.json({ error: "debit_status invalide" }, { status: 400 });
      }
    }
    if (body.credit_status !== undefined) {
      const v = body.credit_status;
      if (v === null || v === "") {
        updates.credit_status = null;
      } else if (typeof v === "string") {
        if (!isCreditTransactionStatus(v)) {
          return NextResponse.json(
            { error: "credit_status invalide (paye ou vide)" },
            { status: 400 }
          );
        }
        updates.credit_status = v;
      } else {
        return NextResponse.json({ error: "credit_status invalide" }, { status: 400 });
      }
    }
    if (body.spending_category !== undefined) {
      const v = body.spending_category;
      if (v === null || v === "") {
        updates.spending_category = null;
      } else if (typeof v === "string") {
        if (!isSpendingCategory(v)) {
          return NextResponse.json(
            {
              error:
                "spending_category invalide (META, Ads setup, Domain, Dev, Autre ou vide)",
            },
            { status: 400 }
          );
        }
        updates.spending_category = v;
      } else {
        return NextResponse.json({ error: "spending_category invalide" }, { status: 400 });
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No editable fields provided" },
        { status: 400 }
      );
    }

    const existingRows = await sql`
      SELECT bank_account_id, transaction_date, amount, description, type, internal_transfer_debit_id
      FROM transactions
      WHERE id = ${id}::uuid
    `;
    const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;
    if (!existing) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const existingType = String((existing as { type?: string }).type ?? "");
    const existingPairId = (existing as { internal_transfer_debit_id?: string | null })
      .internal_transfer_debit_id;
    const effectiveType =
      updates.type !== undefined ? String(updates.type) : existingType;

    if (existingType === "INTERNAL_CREDIT" && updates.type === "DEBIT") {
      return NextResponse.json(
        { error: "Impasse de passer un crédit interne en débit." },
        { status: 400 }
      );
    }

    const clearInternalPair =
      updates.type === "CREDIT" && existingType === "INTERNAL_CREDIT";

    if (
      updates.debit_status !== undefined &&
      updates.debit_status !== null &&
      effectiveType !== "DEBIT"
    ) {
      return NextResponse.json(
        { error: "Le statut ne s'applique qu'aux débits" },
        { status: 400 }
      );
    }
    if (
      updates.credit_status !== undefined &&
      updates.credit_status !== null &&
      effectiveType !== "CREDIT"
    ) {
      return NextResponse.json(
        { error: "Le statut crédit ne s'applique qu'aux crédits" },
        { status: 400 }
      );
    }
    if (
      updates.spending_category !== undefined &&
      updates.spending_category !== null &&
      effectiveType === "INTERNAL_CREDIT"
    ) {
      return NextResponse.json(
        { error: "La catégorie de dépense ne s'applique pas aux crédits internes" },
        { status: 400 }
      );
    }

    if (updates.type === "CREDIT") {
      updates.debit_status = null;
    }
    if (updates.type === "DEBIT" || updates.type === "INTERNAL_CREDIT") {
      updates.credit_status = null;
    }
    if (updates.type === "INTERNAL_CREDIT") {
      updates.spending_category = null;
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (updates.transaction_date !== undefined) {
      setClauses.push(`transaction_date = $${idx++}`);
      values.push(updates.transaction_date);
    }
    if (updates.amount !== undefined) {
      setClauses.push(`amount = $${idx++}`);
      values.push(updates.amount);
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${idx++}`);
      values.push(updates.description);
    }
    if (updates.type !== undefined) {
      setClauses.push(`type = $${idx++}::transactiontype`);
      values.push(updates.type);
    }
    if (updates.fournisseur_id !== undefined) {
      setClauses.push(`fournisseur_id = $${idx++}::uuid`);
      values.push(updates.fournisseur_id);
    }
    if (updates.client_account_type_id !== undefined) {
      setClauses.push(`client_account_type_id = $${idx++}::uuid`);
      values.push(updates.client_account_type_id);
    }
    if (updates.debit_status !== undefined) {
      setClauses.push(`debit_status = $${idx++}`);
      values.push(updates.debit_status);
    }
    if (updates.credit_status !== undefined) {
      setClauses.push(`credit_status = $${idx++}`);
      values.push(updates.credit_status);
    }
    if (updates.spending_category !== undefined) {
      setClauses.push(`spending_category = $${idx++}`);
      values.push(updates.spending_category);
    }
    if (clearInternalPair) {
      setClauses.push("internal_transfer_debit_id = NULL");
    }
    values.push(id);

    const queryText = `
      UPDATE transactions
      SET ${setClauses.join(", ")}
      WHERE id = $${idx}::uuid
    `;

    try {
      await sql.query(queryText, values);

      const finalType = updates.type !== undefined ? String(updates.type) : existingType;
      let pairedDebitId: string | null =
        existingPairId != null && String(existingPairId) !== ""
          ? String(existingPairId)
          : null;
      if (clearInternalPair || finalType !== "INTERNAL_CREDIT") {
        pairedDebitId = null;
      }
      if (
        updates.fournisseur_id !== undefined &&
        finalType === "INTERNAL_CREDIT" &&
        pairedDebitId
      ) {
        const fid = updates.fournisseur_id;
        if (fid === null || fid === "") {
          await sql`
            UPDATE transactions SET fournisseur_id = NULL WHERE id = ${pairedDebitId}::uuid
          `;
        } else {
          await sql`
            UPDATE transactions SET fournisseur_id = ${fid}::uuid WHERE id = ${pairedDebitId}::uuid
          `;
        }
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
          t.spending_category,
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
        WHERE t.id = ${id}::uuid
      `;
      const full = Array.isArray(fullRows) ? fullRows[0] : fullRows;
      if (!full) {
        return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
      }
      return NextResponse.json(full);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("uix_bank_account_transaction") || msg.includes("uix_company_transaction") || msg.includes("unique") || msg.includes("duplicate")) {
        return NextResponse.json(
          { error: "Une transaction identique existe déjà (société, date, montant, description)" },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("PATCH /api/transactions/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
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
    const { id } = await params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "ID invalide" }, { status: 400 });
    }
    const result = await sql.query(
      "DELETE FROM transactions WHERE id = $1::uuid RETURNING id",
      [id]
    );
    const deleted = Array.isArray(result) ? result[0] : result;
    if (!deleted) {
      return NextResponse.json({ error: "Transaction introuvable" }, { status: 404 });
    }
    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store, no-cache" } }
    );
  } catch (error) {
    console.error("DELETE /api/transactions/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la suppression" },
      { status: 500 }
    );
  }
}
