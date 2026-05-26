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
      SELECT id, name, sort_order, created_at, updated_at
      FROM sources
      ORDER BY sort_order, name
    `;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/sources error:", error);
    return NextResponse.json(
      { error: "Échec du chargement des sources." },
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
        { error: "Le nom de la source est requis." },
        { status: 400 }
      );
    }
    const sortOrder = typeof body?.sort_order === "number" ? body.sort_order : 0;
    const rows = await sql`
      INSERT INTO sources (name, sort_order)
      VALUES (${name}, ${sortOrder})
      RETURNING id, name, sort_order, created_at, updated_at
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Échec de la création de la source." },
        { status: 500 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("POST /api/sources error:", error);
    return NextResponse.json(
      { error: "Échec de la création de la source." },
      { status: 500 }
    );
  }
}
