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
    const sortOrder = typeof body?.sort_order === "number" ? body.sort_order : undefined;
    if (!name && sortOrder === undefined) {
      return NextResponse.json(
        { error: "Aucune modification fournie." },
        { status: 400 }
      );
    }
    if (name !== undefined && !name) {
      return NextResponse.json(
        { error: "Le nom du type de compte ne peut pas être vide." },
        { status: 400 }
      );
    }
    const [existing] = await sql`
      SELECT id, name, sort_order FROM account_types WHERE id = ${id}::uuid
    `;
    if (!existing) {
      return NextResponse.json(
        { error: "Type de compte introuvable." },
        { status: 404 }
      );
    }
    const newName = name ?? existing.name;
    const newSortOrder = sortOrder !== undefined ? sortOrder : existing.sort_order;
    const rows = await sql`
      UPDATE account_types
      SET name = ${newName}, sort_order = ${newSortOrder}, updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING id, name, sort_order, created_at, updated_at
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Type de compte introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("PATCH /api/account-types/[id] error:", error);
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
      DELETE FROM account_types WHERE id = ${id}::uuid RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Type de compte introuvable." },
        { status: 404 }
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/account-types/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la suppression." },
      { status: 500 }
    );
  }
}
