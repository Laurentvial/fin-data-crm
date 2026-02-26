import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

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
      SELECT id, company_id, email, created_at, updated_at
      FROM company_emails
      WHERE company_id = ${id}
      ORDER BY email
    `;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/accounts/[id]/emails error:", error);
    return NextResponse.json(
      { error: "Échec du chargement des emails." },
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
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email) {
      return NextResponse.json(
        { error: "L'email est requis." },
        { status: 400 }
      );
    }
    const encryptedPassword = encrypt(password);
    const rows = await sql`
      INSERT INTO company_emails (company_id, email, password)
      VALUES (${id}, ${email}, ${encryptedPassword})
      RETURNING id, company_id, email, created_at, updated_at
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
    console.error("POST /api/accounts/[id]/emails error:", error);
    return NextResponse.json(
      { error: "Échec de l'ajout de l'email." },
      { status: 500 }
    );
  }
}
