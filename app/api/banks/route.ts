import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { canMutate } from "@/lib/auth/permissions";
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
      SELECT b.id, b.name, b.url, b.bic, b.created_at, b.updated_at,
        EXISTS(SELECT 1 FROM bank_files bf WHERE bf.bank_id = b.id AND bf.file_type = 'logo') AS has_logo
      FROM banks b
      ORDER BY b.name
    `;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/banks error:", error);
    return NextResponse.json(
      { error: "Échec du chargement des banques." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "Le nom de la banque est requis." },
        { status: 400 }
      );
    }
    const url = typeof body?.url === "string" ? body.url.trim() || null : null;
    const bic = typeof body?.bic === "string" ? body.bic.trim().toUpperCase() || null : null;
    const rows = await sql`
      INSERT INTO banks (name, url, bic)
      VALUES (${name}, ${url}, ${bic})
      RETURNING id, name, url, bic, created_at, updated_at
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Échec de la création de la banque." },
        { status: 500 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("POST /api/banks error:", error);
    return NextResponse.json(
      { error: "Échec de la création de la banque." },
      { status: 500 }
    );
  }
}
