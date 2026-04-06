import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { extractTransactionsFromPdfBuffer } from "@/lib/bank-statement-extract";
import { findDuplicateCandidates, type DbTxnMatchRow } from "@/lib/bank-statement-import-match";

export const maxDuration = 120;

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

const MATCH_QUERY_LIMIT = 2000;

export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Content-Type multipart/form-data attendu." }, { status: 400 });
    }

    const form = await request.formData();
    const bankAccountId = form.get("bank_account_id");
    const file = form.get("file");

    if (typeof bankAccountId !== "string" || !bankAccountId.trim()) {
      return NextResponse.json({ error: "bank_account_id est requis." }, { status: 400 });
    }
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Fichier PDF requis (champ file)." }, { status: 400 });
    }

    const mime = (file.type || "").toLowerCase();
    if (mime && mime !== "application/pdf" && mime !== "application/octet-stream") {
      return NextResponse.json({ error: "Seuls les fichiers PDF sont acceptés." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const filename =
      typeof (file as File).name === "string" && (file as File).name ? (file as File).name : "statement.pdf";

    const extracted = await extractTransactionsFromPdfBuffer(buf, filename);

    if (extracted.length === 0) {
      return NextResponse.json({
        rows: [],
        message: "Aucune transaction exploitable n'a été détectée dans ce PDF.",
      });
    }

    const sortedDates = [...extracted.map((l) => l.transaction_date)].sort();
    const dateFrom = sortedDates[0]!;
    const dateTo = sortedDates[sortedDates.length - 1]!;

    const dbRowsRaw = await sql`
      SELECT id, transaction_date, amount, type, description
      FROM transactions
      WHERE bank_account_id = ${bankAccountId.trim()}::uuid
        AND transaction_date >= ${dateFrom}::date
        AND transaction_date <= ${dateTo}::date
      ORDER BY transaction_date DESC, created_at DESC
      LIMIT ${MATCH_QUERY_LIMIT}
    `;

    const dbList: DbTxnMatchRow[] = (Array.isArray(dbRowsRaw) ? dbRowsRaw : dbRowsRaw != null ? [dbRowsRaw] : []).map(
      (r) =>
        r as unknown as {
          id: string;
          transaction_date: string;
          amount: number | string;
          type: string;
          description: string | null;
        }
    );

    const rows = extracted.map((line, index) => {
      const candidates = findDuplicateCandidates(line, dbList);
      const matchStatus = candidates.length > 0 ? "possible_duplicate" : "new";
      const defaultImport = true;
      return {
        index,
        transaction_date: line.transaction_date,
        amount: line.amount,
        description: line.description,
        type: line.type,
        match_status: matchStatus,
        default_import: defaultImport,
        candidates: candidates.map((c) => ({
          id: c.id,
          transaction_date:
            typeof c.transaction_date === "string"
              ? c.transaction_date.slice(0, 10)
              : String(c.transaction_date),
          amount: roundDisplayAmount(c.amount),
          type: c.type,
          description: c.description ?? "",
        })),
      };
    });

    return NextResponse.json({
      bank_account_id: bankAccountId.trim(),
      date_from: dateFrom,
      date_to: dateTo,
      rows,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /api/transactions/import/preview:", err);
    return NextResponse.json(
      { error: msg || "Échec de l'analyse du relevé." },
      { status: 500 }
    );
  }
}

function roundDisplayAmount(a: number | string): number {
  const n = Number(a);
  return Math.round(n * 100) / 100;
}
