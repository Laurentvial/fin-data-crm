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
    const [row] = await sql`
      SELECT id, name, url, bic, created_at, updated_at
      FROM banks
      WHERE id = ${id}::uuid
    `;
    if (!row) {
      return NextResponse.json(
        { error: "Banque introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("GET /api/banks/[id] error:", error);
    return NextResponse.json(
      { error: "Échec du chargement." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id } = await params;
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : undefined;
    if (!name) {
      return NextResponse.json(
        { error: "Le nom de la banque est requis." },
        { status: 400 }
      );
    }
    const [existing] = await sql`
      SELECT id, name, url, bic FROM banks WHERE id = ${id}::uuid
    `;
    if (!existing) {
      return NextResponse.json(
        { error: "Banque introuvable." },
        { status: 404 }
      );
    }
    const url =
      "url" in body
        ? (typeof body.url === "string" ? body.url.trim() || null : null)
        : (existing.url as string | null);
    const bic =
      "bic" in body
        ? (typeof body.bic === "string" ? body.bic.trim().toUpperCase() || null : null)
        : (existing.bic as string | null);
    const rows = await sql`
      UPDATE banks
      SET name = ${name}, url = ${url}, bic = ${bic}, updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING id, name, url, bic, created_at, updated_at
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Banque introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("PATCH /api/banks/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la mise à jour." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id } = await params;
  try {
    const rows = await sql`
      DELETE FROM banks WHERE id = ${id}::uuid RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Banque introuvable." },
        { status: 404 }
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/banks/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la suppression." },
      { status: 500 }
    );
  }
}
