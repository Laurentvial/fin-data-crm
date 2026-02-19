import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const company_id = searchParams.get("company_id") || null;
    const date_from = searchParams.get("date_from") || null;
    const date_to = searchParams.get("date_to") || null;
    const type = searchParams.get("type") || null;
    const limit = Math.min(Number(searchParams.get("limit")) || 500, 1000);
    const offset = Number(searchParams.get("offset")) || 0;

    const rows = await sql`
      SELECT
        t.id,
        t.company_id,
        t.transaction_date,
        t.amount,
        t.description,
        t.type,
        t.raw_image_path,
        t.extracted_data_json,
        t.created_at,
        t.processed_by_user_id,
        c.name AS company_name
      FROM transactions t
      LEFT JOIN companies c ON c.id = t.company_id
      WHERE
        (${company_id}::uuid IS NULL OR t.company_id = ${company_id}::uuid)
        AND (${date_from}::date IS NULL OR t.transaction_date >= ${date_from}::date)
        AND (${date_to}::date IS NULL OR t.transaction_date <= ${date_to}::date)
        AND (${type}::text IS NULL OR t.type::text = ${type})
      ORDER BY t.transaction_date DESC, t.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/transactions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
