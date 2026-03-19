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

const FIXED_TYPES = ["logo", "kbis", "statut", "pi_gerant", "pi_recto", "pi_verso", "selfie"] as const;

function isValidFileType(type: string): boolean {
  if (FIXED_TYPES.includes(type as (typeof FIXED_TYPES)[number])) return true;
  if (type.startsWith("autre_")) {
    const slug = type.slice(6);
    return /^[a-z0-9_]+$/.test(slug) && slug.length <= 40;
  }
  return false;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; type: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id, type } = await params;

  if (!isValidFileType(type)) {
    return NextResponse.json(
      { error: "Type invalide." },
      { status: 400 }
    );
  }

  try {
    const rows = await sql`
      SELECT filename, content_type, data_base64
      FROM company_files
      WHERE company_id = ${id} AND file_type = ${type}
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Fichier introuvable." },
        { status: 404 }
      );
    }

    const dataBase64 = row.data_base64 as string;
    const buffer = Buffer.from(dataBase64, "base64");
    const contentType = (row.content_type as string) || "application/octet-stream";
    const filename = row.filename as string | null;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        ...(filename && {
          "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        }),
      },
    });
  } catch (error) {
    console.error("GET /api/accounts/[id]/files/[type] error:", error);
    return NextResponse.json(
      { error: "Échec du chargement." },
      { status: 500 }
    );
  }
}
