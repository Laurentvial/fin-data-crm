import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { canMutate } from "@/lib/auth/permissions";
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
    const companyRows = await sql`
      SELECT COALESCE(country_code, 'FR') AS country_code FROM companies WHERE id = ${id}::uuid LIMIT 1
    `;
    const companyRow = Array.isArray(companyRows) ? companyRows[0] : companyRows;
    if (!companyRow) {
      return NextResponse.json({ error: "Société introuvable" }, { status: 404 });
    }
    const countryCode = (companyRow.country_code as string) ?? "FR";

    const rows = await sql`
      SELECT id, company_id, name, country_code, template_content, is_default, created_at, updated_at
      FROM invoice_templates
      WHERE company_id = ${id}::uuid OR (company_id IS NULL AND country_code = ${countryCode})
      ORDER BY company_id DESC NULLS LAST, is_default DESC, name
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
    console.error("GET /api/accounts/[id]/templates error:", error);
    return NextResponse.json(
      { error: "Échec du chargement des templates" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
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
    const companyCheck = await sql`
      SELECT 1 FROM companies WHERE id = ${id}::uuid LIMIT 1
    `;
    if (Array.isArray(companyCheck) ? companyCheck.length === 0 : !companyCheck) {
      return NextResponse.json({ error: "Société introuvable" }, { status: 404 });
    }

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
        WHERE company_id = ${id}::uuid
      `;
    }

    const rows = await sql`
      INSERT INTO invoice_templates (company_id, name, country_code, template_content, is_default)
      VALUES (${id}::uuid, ${name}, ${countryCode}, ${templateContent}, ${isDefault})
      RETURNING id, company_id, name, country_code, template_content, is_default, created_at, updated_at
    `;
    const row = Array.isArray(rows) ? rows[0] : rows;

    return NextResponse.json(row);
  } catch (error) {
    console.error("POST /api/accounts/[id]/templates error:", error);
    return NextResponse.json(
      { error: "Échec de la création du template" },
      { status: 500 }
    );
  }
}
