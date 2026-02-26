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
    const rows = await sql`
      SELECT id, name, address, siret, directeur, created_at, updated_at
      FROM companies
      WHERE id = ${id}
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Société introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("GET /api/accounts/[id] error:", error);
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
      UPDATE companies
      SET name = ${name}, address = ${address}, siret = ${siret}, directeur = ${directeur}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, address, siret, directeur, created_at, updated_at
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Société introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("PATCH /api/accounts/[id] error:", error);
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
    const countRows = await sql`
      SELECT 1 FROM bank_accounts WHERE company_id = ${id} LIMIT 1
    `;
    if (countRows.length > 0) {
      return NextResponse.json(
        { error: "Impossible de supprimer : cette société a des comptes bancaires associés." },
        { status: 400 }
      );
    }
    const rows = await sql`
      DELETE FROM companies WHERE id = ${id} RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Société introuvable." },
        { status: 404 }
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/accounts/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la suppression." },
      { status: 500 }
    );
  }
}
