import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { isAppSuperAdmin } from "@/lib/app-super-admin";
import { sql } from "@/lib/db";

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Tous les jours calendaires de `from` à `to` inclus (yyyy-mm-dd). */
function eachDayIso(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const toNorm = to;
  let y = fy;
  let m = fm;
  let d = fd;
  for (;;) {
    const key = formatYmd(y, m, d);
    out.push(key);
    if (key === toNorm) break;
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 1);
    y = dt.getFullYear();
    m = dt.getMonth() + 1;
    d = dt.getDate();
    if (out.length > 4000) break;
  }
  return out;
}

/** Période inclusive [date_from 00:00, date_to fin de journée] &lt; 48 h → granularité horaire. */
function spanIsUnder48Hours(dateFrom: string, dateTo: string): boolean {
  const [y1, m1, d1] = dateFrom.split("-").map(Number);
  const [y2, m2, d2] = dateTo.split("-").map(Number);
  const start = Date.UTC(y1, m1 - 1, d1, 0, 0, 0, 0);
  const end = Date.UTC(y2, m2 - 1, d2, 23, 59, 59, 999);
  return end - start < 48 * 60 * 60 * 1000;
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
  const company_id = searchParams.get("company_id") || null;

  if (!isValidDate(date_from) || !isValidDate(date_to)) {
    return NextResponse.json(
      { error: "date_from et date_to requis (format YYYY-MM-DD)." },
      { status: 400 }
    );
  }
  if (date_from > date_to) {
    return NextResponse.json(
      { error: "date_from doit être antérieure ou égale à date_to." },
      { status: 400 }
    );
  }

  const useHourly = spanIsUnder48Hours(date_from, date_to);

  try {
    if (!useHourly) {
      const raw = await sql`
        SELECT
          t.transaction_date::text AS day,
          COALESCE(SUM(CASE WHEN t.type = 'CREDIT'::transactiontype THEN t.amount::numeric ELSE 0 END), 0)::float AS credits,
          COALESCE(SUM(CASE WHEN t.type = 'DEBIT'::transactiontype THEN t.amount::numeric ELSE 0 END), 0)::float AS debits
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
          AND (
            (${company_id})::text IS NULL
            OR ba.company_id::text = (${company_id})::text
          )
        GROUP BY t.transaction_date
        ORDER BY t.transaction_date ASC
      `;

      const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
      const byDay = new Map<string, { credits: number; debits: number }>();
      for (const r of list as { day: string; credits: number; debits: number }[]) {
        byDay.set(r.day, {
          credits: Math.round(Number(r.credits) * 100) / 100,
          debits: Math.round(Number(r.debits) * 100) / 100,
        });
      }

      const days = eachDayIso(date_from, date_to);
      const points = days.map((day) => {
        const x = byDay.get(day) ?? { credits: 0, debits: 0 };
        return {
          date: day,
          credits: x.credits,
          debits: x.debits,
        };
      });

      return NextResponse.json({ granularity: "day" as const, points, date_from, date_to });
    }

    const raw = await sql`
      WITH series AS (
        SELECT generate_series(
          ((${date_from} || ' 00:00:00')::timestamp AT TIME ZONE 'Europe/Paris'),
          ((${date_to} || ' 23:00:00')::timestamp AT TIME ZONE 'Europe/Paris'),
          interval '1 hour'
        ) AS bucket
      ),
      agg AS (
        SELECT
          date_trunc('hour', t.created_at AT TIME ZONE 'Europe/Paris') AS bh,
          COALESCE(SUM(CASE WHEN t.type = 'CREDIT'::transactiontype THEN t.amount::numeric ELSE 0 END), 0)::float AS credits,
          COALESCE(SUM(CASE WHEN t.type = 'DEBIT'::transactiontype THEN t.amount::numeric ELSE 0 END), 0)::float AS debits
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
          AND (
            (${company_id})::text IS NULL
            OR ba.company_id::text = (${company_id})::text
          )
        GROUP BY date_trunc('hour', t.created_at AT TIME ZONE 'Europe/Paris')
      )
      SELECT
        s.bucket AS bucket,
        ROUND(COALESCE(a.credits, 0)::numeric, 2)::float AS credits,
        ROUND(COALESCE(a.debits, 0)::numeric, 2)::float AS debits
      FROM series s
      LEFT JOIN agg a ON (s.bucket AT TIME ZONE 'Europe/Paris') = a.bh
      ORDER BY s.bucket ASC
    `;

    const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
    const points = (list as { bucket: string | Date; credits: number; debits: number }[]).map((r) => {
      const b = r.bucket;
      const iso =
        typeof b === "string"
          ? b
          : b instanceof Date
            ? b.toISOString()
            : String(b);
      return {
        date: iso,
        credits: Number(r.credits),
        debits: Number(r.debits),
      };
    });

    return NextResponse.json({ granularity: "hour" as const, points, date_from, date_to });
  } catch (e) {
    console.error("GET /api/reporting/financial-timeseries:", e);
    return NextResponse.json({ error: "Échec du chargement des séries." }, { status: 500 });
  }
}
