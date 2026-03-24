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

function requireAdmin(user: unknown) {
  if ((user as { role?: string })?.role !== "admin") {
    return NextResponse.json(
      { error: "Accès réservé aux administrateurs." },
      { status: 403 }
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
      FROM fournisseurs
      ORDER BY sort_order, name
    `;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/fournisseurs error:", error);
    return NextResponse.json(
      { error: "Échec du chargement des fournisseurs." },
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
  const adminErr = requireAdmin(session.user);
  if (adminErr) return adminErr;
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "Le nom du fournisseur est requis." },
        { status: 400 }
      );
    }
    const sortOrder = typeof body?.sort_order === "number" ? body.sort_order : 0;
    const rows = await sql`
      INSERT INTO fournisseurs (name, sort_order)
      VALUES (${name}, ${sortOrder})
      RETURNING id, name, sort_order, created_at, updated_at
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Échec de la création du fournisseur." },
        { status: 500 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("POST /api/fournisseurs error:", error);
    return NextResponse.json(
      { error: "Échec de la création du fournisseur." },
      { status: 500 }
    );
  }
}
