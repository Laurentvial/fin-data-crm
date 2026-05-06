import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { isDebitTransactionStatus } from "@/lib/debit-status";
import { isCreditTransactionStatus } from "@/lib/credit-status";
import type { TransactionType } from "@/lib/types";

export const maxDuration = 120;

const TRANSACTION_TYPES: TransactionType[] = ["DEBIT", "CREDIT"];

async function requireAuthUserId() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Non authentifié. Veuillez vous reconnecter." }, { status: 401 }) };
  }
  return { session };
}

/** True when `s` is YYYY-MM-DD and denotes an actual calendar date (PostgreSQL date compatible). */
function isValidDate(s: string): boolean {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return false;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
  );
}

interface CommitItem {
  transaction_date?: unknown;
  amount?: unknown;
  description?: unknown;
  type?: unknown;
  debit_status?: unknown;
  credit_status?: unknown;
  import?: unknown;
}

export async function POST(request: NextRequest) {
  const authRes = await requireAuthUserId();
  if ("error" in authRes) return authRes.error;
  const { session } = authRes;

  try {
    const body = await request.json();
    const bank_account_id = body.bank_account_id ?? body.company_id;
    const itemsRaw = body.items;

    if (typeof bank_account_id !== "string" || !bank_account_id.trim()) {
      return NextResponse.json({ error: "bank_account_id est requis" }, { status: 400 });
    }
    if (!Array.isArray(itemsRaw)) {
      return NextResponse.json({ error: "items doit être un tableau" }, { status: 400 });
    }

    const toInsert: {
      transaction_date: string;
      amount: number;
      description: string;
      type: TransactionType;
      debitStatus: string | null;
      creditStatus: string | null;
    }[] = [];

    for (const raw of itemsRaw as CommitItem[]) {
      if (!raw || typeof raw !== "object") continue;
      if (raw.import !== true) continue;

      const transaction_date = raw.transaction_date;
      const amount = raw.amount;
      const description = typeof raw.description === "string" ? raw.description : "";
      const type = raw.type === "CREDIT" || raw.type === "DEBIT" ? raw.type : null;

      if (typeof transaction_date !== "string" || !isValidDate(transaction_date)) {
        return NextResponse.json({ error: "transaction_date invalide (format YYYY-MM-DD)" }, { status: 400 });
      }
      const n = Number(amount);
      if (Number.isNaN(n) || n <= 0) {
        return NextResponse.json({ error: "amount invalide (nombre positif)" }, { status: 400 });
      }
      if (!type || !TRANSACTION_TYPES.includes(type)) {
        return NextResponse.json({ error: "type invalide (DEBIT ou CREDIT)" }, { status: 400 });
      }

      let debitStatus: string | null = null;
      const rawDebitStatus = raw.debit_status;
      if (rawDebitStatus !== undefined && rawDebitStatus !== null && rawDebitStatus !== "") {
        if (typeof rawDebitStatus !== "string" || !isDebitTransactionStatus(rawDebitStatus)) {
          return NextResponse.json(
            { error: "debit_status invalide (ok, a_verifier, annulee_bloquee ou vide)" },
            { status: 400 }
          );
        }
        if (type !== "DEBIT") {
          return NextResponse.json({ error: "debit_status réservé aux débits" }, { status: 400 });
        }
        debitStatus = rawDebitStatus;
      }

      let creditStatus: string | null = null;
      const rawCreditStatus = raw.credit_status;
      if (rawCreditStatus !== undefined && rawCreditStatus !== null && rawCreditStatus !== "") {
        if (typeof rawCreditStatus !== "string" || !isCreditTransactionStatus(rawCreditStatus)) {
          return NextResponse.json(
            { error: "credit_status invalide (paye ou vide)" },
            { status: 400 }
          );
        }
        if (type !== "CREDIT") {
          return NextResponse.json({ error: "credit_status réservé aux crédits" }, { status: 400 });
        }
        creditStatus = rawCreditStatus;
      }

      const rounded = Math.round(n * 100) / 100;

      toInsert.push({
        transaction_date,
        amount: rounded,
        description,
        type,
        debitStatus,
        creditStatus,
      });
    }

    if (toInsert.length === 0) {
      return NextResponse.json({ inserted: 0, ids: [] });
    }

    const telegramRow = await sql`
      SELECT telegram_id FROM user_telegram WHERE user_id = ${session.user.id}::uuid
    `;
    const telegramId = Array.isArray(telegramRow)
      ? telegramRow[0]?.telegram_id
      : (telegramRow as { telegram_id?: number })?.telegram_id;
    const processedByUserId = telegramId != null ? Number(telegramId) : null;

    const extractedMeta = { source: "pdf_import" };

    const results = await sql.transaction(
      toInsert.map((row) =>
        sql`
          INSERT INTO transactions (
            bank_account_id, transaction_date, amount, description, type,
            processed_by_user_id, debit_status, credit_status, extracted_data_json
          )
          VALUES (
            ${bank_account_id.trim()}::uuid,
            ${row.transaction_date}::date,
            ${row.amount},
            ${row.description},
            ${row.type}::transactiontype,
            ${processedByUserId},
            ${row.debitStatus},
            ${row.creditStatus},
            ${JSON.stringify(extractedMeta)}::jsonb
          )
          RETURNING id
        `
      )
    );

    const ids: string[] = [];
    for (const batch of results) {
      const rows = Array.isArray(batch) ? batch : batch != null ? [batch] : [];
      for (const r of rows) {
        const id = (r as { id?: string })?.id;
        if (id) ids.push(id);
      }
    }

    return NextResponse.json({ inserted: ids.length, ids });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("foreign key") || msg.includes("bank_account_id")) {
      return NextResponse.json({ error: "Compte bancaire introuvable" }, { status: 400 });
    }
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        { error: "Une ou plusieurs transactions existent déjà (contrainte d'unicité)." },
        { status: 409 }
      );
    }
    console.error("POST /api/transactions/import/commit:", err);
    return NextResponse.json({ error: "Échec de l'import" }, { status: 500 });
  }
}
