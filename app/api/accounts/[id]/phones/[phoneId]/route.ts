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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; phoneId: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id, phoneId } = await params;
  try {
    const rows = await sql`
      DELETE FROM company_phones
      WHERE id = ${phoneId} AND company_id = ${id}
      RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Numéro introuvable." },
        { status: 404 }
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/accounts/[id]/phones/[phoneId] error:", error);
    return NextResponse.json(
      { error: "Échec de la suppression." },
      { status: 500 }
    );
  }
}
