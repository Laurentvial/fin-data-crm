import { NextRequest, NextResponse } from "next/server";
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

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const rows = await sql`
      SELECT id, company_id, name, country_code, template_content, is_default, created_at, updated_at
      FROM invoice_templates
      WHERE company_id IS NULL
      ORDER BY is_default DESC, name
    `;

    const templates = (Array.isArray(rows) ? rows : [rows]).map((r) => ({
      id: r.id,
      company_id: r.company_id,
      name: r.name,
      country_code: r.country_code,
      template_content: r.template_content,
      is_default: r.is_default,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return NextResponse.json(templates);
  } catch (error) {
    console.error("GET /api/templates error:", error);
    return NextResponse.json(
      { error: "Échec du chargement des templates" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const countryCode =
      typeof body?.country_code === "string"
        ? body.country_code.trim().slice(0, 2).toUpperCase()
        : "FR";
    const templateContent =
      typeof body?.template_content === "string" ? body.template_content : "";
    const isDefault = Boolean(body?.is_default);

    if (!name) {
      return NextResponse.json(
        { error: "Le nom du template est requis" },
        { status: 400 }
      );
    }

    if (isDefault) {
      await sql`
        UPDATE invoice_templates
        SET is_default = false
        WHERE company_id IS NULL
      `;
    }

    const rows = await sql`
      INSERT INTO invoice_templates (company_id, name, country_code, template_content, is_default)
      VALUES (NULL, ${name}, ${countryCode}, ${templateContent}, ${isDefault})
      RETURNING id, company_id, name, country_code, template_content, is_default, created_at, updated_at
    `;
    const row = Array.isArray(rows) ? rows[0] : rows;

    return NextResponse.json(row);
  } catch (error) {
    console.error("POST /api/templates error:", error);
    return NextResponse.json(
      { error: "Échec de la création du template" },
      { status: 500 }
    );
  }
}
