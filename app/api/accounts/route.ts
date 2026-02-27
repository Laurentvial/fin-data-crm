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

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const rows = await sql`
      SELECT
        c.id,
        c.name,
        c.address,
        c.siret,
        c.directeur,
        c.created_at,
        c.updated_at,
        EXISTS(SELECT 1 FROM company_files WHERE company_id = c.id AND file_type = 'logo') AS has_logo,
        COALESCE(
          (SELECT array_agg(bank_id) FROM (
            SELECT DISTINCT bank_id FROM bank_accounts
            WHERE company_id = c.id AND bank_id IS NOT NULL
          ) sub),
          ARRAY[]::uuid[]
        ) AS bank_ids,
        COALESCE(
          (SELECT array_agg(email ORDER BY email) FROM company_emails WHERE company_id = c.id),
          ARRAY[]::text[]
        ) AS emails,
        COALESCE(
          (SELECT array_agg(phone ORDER BY phone) FROM company_phones WHERE company_id = c.id),
          ARRAY[]::text[]
        ) AS phones
      FROM companies c
      ORDER BY c.name
    `;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/accounts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch companies" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "Le nom est requis." },
        { status: 400 }
      );
    }
    const address = typeof body?.address === "string" ? body.address.trim() || null : null;
    const siret = typeof body?.siret === "string" ? body.siret.trim() || null : null;
    const directeur = typeof body?.directeur === "string" ? body.directeur.trim() || null : null;
    const rows = await sql`
      INSERT INTO companies (name, address, siret, directeur)
      VALUES (${name}, ${address}, ${siret}, ${directeur})
      RETURNING id, name, address, siret, directeur, created_at, updated_at
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Échec de la création." },
        { status: 500 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("POST /api/accounts error:", error);
    return NextResponse.json(
      { error: "Échec de la création de la société." },
      { status: 500 }
    );
  }
}
