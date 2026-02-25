import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import type { TransactionType } from "@/lib/types";

export const dynamic = "force-dynamic";

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
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
      if (!TRANSACTION_TYPES.includes(body.type)) {
        return NextResponse.json(
          { error: "Invalid type (expected DEBIT or CREDIT)" },
          { status: 400 }
        );
      }
      updates.type = body.type;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No editable fields provided" },
        { status: 400 }
      );
    }

    const existingRows = await sql`
      SELECT bank_account_id, transaction_date, amount, description
      FROM transactions
      WHERE id = ${id}::uuid
    `;
    const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;
    if (!existing) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
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
    values.push(id);

    const queryText = `
      UPDATE transactions
      SET ${setClauses.join(", ")}
      WHERE id = $${idx}::uuid
      RETURNING id, bank_account_id, transaction_date, amount, description, type, created_at
    `;

    try {
      const result = await sql.query(queryText, values);
      const rows = Array.isArray(result) ? result : [result];
      const row = rows[0];
      if (!row) {
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
      }
      return NextResponse.json(row);
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
  const authError = await requireAuth();
  if (authError) return authError;
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
