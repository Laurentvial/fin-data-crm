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
  { params }: { params: Promise<{ id: string; phoneId: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id, phoneId } = await params;
  try {
    const body = await request.json();
    const isDefault = typeof body?.is_default === "boolean" ? body.is_default : undefined;
    if (isDefault !== true) {
      return NextResponse.json({ error: "Aucune modification." }, { status: 400 });
    }
    const existing = await sql`
      SELECT id FROM company_phones
      WHERE id = ${phoneId} AND company_id = ${id}
    `;
    if (existing.length === 0) {
      return NextResponse.json(
        { error: "Numéro introuvable." },
        { status: 404 }
      );
    }
    await sql`UPDATE company_phones SET is_default = false WHERE company_id = ${id}`;
    const r = await sql`
      UPDATE company_phones
      SET is_default = true, updated_at = NOW()
      WHERE id = ${phoneId} AND company_id = ${id}
      RETURNING id, company_id, phone, is_default, created_at, updated_at
    `;
    const row = r[0];
    if (!row) {
      return NextResponse.json({ error: "Échec de la mise à jour." }, { status: 500 });
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("PATCH /api/accounts/[id]/phones/[phoneId] error:", error);
    return NextResponse.json(
      { error: "Échec de la mise à jour." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; phoneId: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id, phoneId } = await params;
  try {
    const toDelete = await sql`
      SELECT id, is_default FROM company_phones
      WHERE id = ${phoneId} AND company_id = ${id}
    `;
    if (toDelete.length === 0) {
      return NextResponse.json(
        { error: "Numéro introuvable." },
        { status: 404 }
      );
    }
    if (toDelete[0].is_default) {
      const nextPhone = await sql`
        SELECT id FROM company_phones
        WHERE company_id = ${id} AND id != ${phoneId}
        ORDER BY created_at ASC
        LIMIT 1
      `;
      if (nextPhone.length > 0) {
        await sql`UPDATE company_phones SET is_default = true WHERE id = ${nextPhone[0].id}`;
      }
    }
    await sql`DELETE FROM company_phones WHERE id = ${phoneId} AND company_id = ${id}`;
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/accounts/[id]/phones/[phoneId] error:", error);
    return NextResponse.json(
      { error: "Échec de la suppression." },
      { status: 500 }
    );
  }
}
