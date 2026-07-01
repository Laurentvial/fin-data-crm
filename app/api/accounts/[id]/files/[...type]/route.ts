import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { canMutate } from "@/lib/auth/permissions";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const FIXED_DOC_TYPES = ["logo", "kbis", "statut", "pi_gerant", "pi_recto", "pi_verso", "selfie"] as const;

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

function isValidFileType(type: string): boolean {
  if (FIXED_DOC_TYPES.includes(type as (typeof FIXED_DOC_TYPES)[number])) return true;
  if (type.startsWith("autre_")) {
    const slug = type.slice(6);
    return /^[a-z0-9_]+$/.test(slug) && slug.length <= 40;
  }
  return false;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; type: string[] }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id, type } = await params;
  const fileType = type[0];

  if (!fileType || type.length > 1) {
    return NextResponse.json({ error: "Type invalide." }, { status: 400 });
  }

  if (!isValidFileType(fileType)) {
    return NextResponse.json({ error: "Type invalide." }, { status: 400 });
  }

  try {
    const rows = await sql`
      SELECT filename, content_type, data_base64
      FROM company_files
      WHERE company_id = ${id} AND file_type = ${fileType}
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
    }

    const buffer = Buffer.from(row.data_base64 as string, "base64");
    const contentType = (row.content_type as string) || "application/octet-stream";
    const filename = row.filename as string | null;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        ...(filename && {
          "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        }),
      },
    });
  } catch (error) {
    console.error("GET /api/accounts/[id]/files/[...type] error:", error);
    return NextResponse.json({ error: "Échec du chargement." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; type: string[] }> }
) {
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
  const { id, type } = await params;
  const fileType = type[0];

  if (!fileType || type.length > 1) {
    return NextResponse.json({ error: "Type requis." }, { status: 400 });
  }

  if (!isValidFileType(fileType)) {
    return NextResponse.json({ error: "Type invalide." }, { status: 400 });
  }

  try {
    const companyCheck = await sql`
      SELECT 1 FROM companies WHERE id = ${id} LIMIT 1
    `;
    if (companyCheck.length === 0) {
      return NextResponse.json({ error: "Société introuvable." }, { status: 404 });
    }

    const deleted = await sql`
      DELETE FROM company_files
      WHERE company_id = ${id} AND file_type = ${fileType}
      RETURNING id
    `;
    if (deleted.length === 0) {
      return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/accounts/[id]/files/[...type] error:", error);
    return NextResponse.json({ error: "Échec de la suppression." }, { status: 500 });
  }
}
