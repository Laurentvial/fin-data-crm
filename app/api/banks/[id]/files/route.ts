import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { canMutate } from "@/lib/auth/permissions";
import { sql } from "@/lib/db";

const ALLOWED_TYPES = ["logo"] as const;
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
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
  const { id } = await params;
  try {
    const bankCheck = await sql`
      SELECT 1 FROM banks WHERE id = ${id}::uuid LIMIT 1
    `;
    if (bankCheck.length === 0) {
      return NextResponse.json(
        { error: "Banque introuvable." },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;

    if (!file || !type) {
      return NextResponse.json(
        { error: "Fichier et type (logo) requis." },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
      return NextResponse.json(
        { error: "Type invalide. Utilisez 'logo'." },
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
      INSERT INTO bank_files (bank_id, file_type, filename, content_type, data_base64)
      VALUES (${id}::uuid, ${type}, ${filename}, ${contentType}, ${dataBase64})
      ON CONFLICT (bank_id, file_type)
      DO UPDATE SET filename = EXCLUDED.filename, content_type = EXCLUDED.content_type, data_base64 = EXCLUDED.data_base64
    `;

    const rows = await sql`
      SELECT id, bank_id, file_type, filename, content_type, created_at
      FROM bank_files
      WHERE bank_id = ${id}::uuid AND file_type = ${type}
    `;
    const row = rows[0];
    return NextResponse.json(row);
  } catch (error) {
    console.error("POST /api/banks/[id]/files error:", error);
    return NextResponse.json(
      { error: "Échec de l'upload." },
      { status: 500 }
    );
  }
}
