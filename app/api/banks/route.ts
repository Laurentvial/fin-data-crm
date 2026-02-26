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
      SELECT id, name, created_at, updated_at
      FROM banks
      ORDER BY name
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
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "Le nom de la banque est requis." },
        { status: 400 }
      );
    }
    const rows = await sql`
      INSERT INTO banks (name)
      VALUES (${name})
      RETURNING id, name, created_at, updated_at
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
