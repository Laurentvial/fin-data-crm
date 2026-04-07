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

const FIXED_DOC_TYPES = ["logo", "kbis", "statut", "pi_gerant", "pi_recto", "pi_verso", "selfie"] as const;
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

function isValidDocType(type: string): boolean {
  if (FIXED_DOC_TYPES.includes(type as (typeof FIXED_DOC_TYPES)[number])) return true;
  if (type.startsWith("autre_")) {
    const slug = type.slice(6);
    return /^[a-z0-9_]+$/.test(slug) && slug.length <= 40;
  }
  return false;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id } = await params;
  try {
    const includeLogo = new URL(request.url).searchParams.get("include_logo") === "1";
    const rows = includeLogo
      ? await sql`
          SELECT id, company_id, file_type, filename, content_type, created_at
          FROM company_files
          WHERE company_id = ${id}
          ORDER BY file_type
        `
      : await sql`
          SELECT id, company_id, file_type, filename, content_type, created_at
          FROM company_files
          WHERE company_id = ${id} AND file_type != 'logo'
          ORDER BY file_type
        `;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/accounts/[id]/files error:", error);
    return NextResponse.json(
      { error: "Échec du chargement." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id } = await params;
  try {
    const companyCheck = await sql`
      SELECT 1 FROM companies WHERE id = ${id} LIMIT 1
    `;
    if (companyCheck.length === 0) {
      return NextResponse.json(
        { error: "Société introuvable." },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;

    if (!file || !type) {
      return NextResponse.json(
        { error: "Fichier et type requis." },
        { status: 400 }
      );
    }

    if (!isValidDocType(type)) {
      return NextResponse.json(
        { error: "Type invalide. Types: logo, kbis, statut, pi_gerant, pi_recto, pi_verso, selfie, autre_<nom>." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Fichier trop volumineux (max 5 Mo)." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const dataBase64 = buffer.toString("base64");
    const filename = file.name || null;
    const contentType = file.type || null;

    await sql`
      INSERT INTO company_files (company_id, file_type, filename, content_type, data_base64)
      VALUES (${id}, ${type}, ${filename}, ${contentType}, ${dataBase64})
      ON CONFLICT (company_id, file_type)
      DO UPDATE SET filename = EXCLUDED.filename, content_type = EXCLUDED.content_type, data_base64 = EXCLUDED.data_base64
    `;

    const rows = await sql`
      SELECT id, company_id, file_type, filename, content_type, created_at
      FROM company_files
      WHERE company_id = ${id} AND file_type = ${type}
    `;
    const row = rows[0];
    return NextResponse.json(row);
  } catch (error) {
    console.error("POST /api/accounts/[id]/files error:", error);
    return NextResponse.json(
      { error: "Échec de l'upload." },
      { status: 500 }
    );
  }
}
