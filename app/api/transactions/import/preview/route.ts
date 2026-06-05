import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { canMutate } from "@/lib/auth/permissions";
import { sql } from "@/lib/db";
import {
  type CsvColumnMapping,
  extractTransactionsFromCsvBuffer,
  extractTransactionsFromPdfBuffer,
} from "@/lib/bank-statement-extract";
import { findDuplicateCandidates, type DbTxnMatchRow } from "@/lib/bank-statement-import-match";

export const maxDuration = 120;

const MATCH_QUERY_LIMIT = 2000;

export async function POST(request: NextRequest) {
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
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Content-Type multipart/form-data attendu." }, { status: 400 });
    }

    const form = await request.formData();
    const bankAccountId = form.get("bank_account_id");
    const file = form.get("file");
    const csvMappingRaw = form.get("csv_mapping");

    if (typeof bankAccountId !== "string" || !bankAccountId.trim()) {
      return NextResponse.json({ error: "bank_account_id est requis." }, { status: 400 });
    }
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Fichier PDF ou CSV requis (champ file)." }, { status: 400 });
    }

    const filename =
      typeof (file as File).name === "string" && (file as File).name ? (file as File).name : "statement.pdf";
    const mime = (file.type || "").toLowerCase();
    const filenameLc = filename.toLowerCase();
    const isCsv =
      filenameLc.endsWith(".csv") ||
      mime.includes("text/csv") ||
      mime.includes("application/csv") ||
      mime.includes("application/vnd.ms-excel");
    const isPdf =
      filenameLc.endsWith(".pdf") || mime === "application/pdf" || mime === "application/octet-stream";
    if (!isCsv && !isPdf) {
      return NextResponse.json({ error: "Seuls les fichiers PDF ou CSV sont acceptés." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const extracted = isCsv
      ? await extractTransactionsFromCsvBuffer(buf, {
          mapping: parseCsvMapping(csvMappingRaw),
        })
      : await extractTransactionsFromPdfBuffer(buf, filename);

    if (extracted.length === 0) {
      return NextResponse.json({
        rows: [],
        message: `Aucune transaction exploitable n'a été détectée dans ce ${isCsv ? "CSV" : "PDF"}.`,
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

function parseCsvMapping(raw: FormDataEntryValue | null): CsvColumnMapping | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clean = (v: unknown): string | undefined =>
      typeof v === "string" && v.trim() ? v.trim() : undefined;

    const date = clean(parsed.date);
    if (!date) return undefined;
    const mapping: CsvColumnMapping = {
      date,
      description: clean(parsed.description),
      amount: clean(parsed.amount),
      debit: clean(parsed.debit),
      credit: clean(parsed.credit),
      type: clean(parsed.type),
    };
    return mapping;
  } catch {
    return undefined;
  }
}
