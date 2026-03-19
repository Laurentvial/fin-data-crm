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
      SELECT id, company_id, phone, is_default, created_at, updated_at
      FROM company_phones
      WHERE company_id = ${id}
      ORDER BY is_default DESC, phone
    `;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/accounts/[id]/phones error:", error);
    return NextResponse.json(
      { error: "Échec du chargement des numéros de téléphone." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
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
    const body = await request.json();
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    if (!phone) {
      return NextResponse.json(
        { error: "Le numéro de téléphone est requis." },
        { status: 400 }
      );
    }
    const existingCount = await sql`SELECT 1 FROM company_phones WHERE company_id = ${id}`;
    const isFirst = existingCount.length === 0;
    const rows = await sql`
      INSERT INTO company_phones (company_id, phone, is_default)
      VALUES (${id}, ${phone}, ${isFirst})
      RETURNING id, company_id, phone, is_default, created_at, updated_at
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Échec de l'ajout." },
        { status: 500 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("POST /api/accounts/[id]/phones error:", error);
    return NextResponse.json(
      { error: "Échec de l'ajout du numéro de téléphone." },
      { status: 500 }
    );
  }
}
