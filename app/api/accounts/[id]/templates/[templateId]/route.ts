import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { canMutate } from "@/lib/auth/permissions";
import { sql } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> }
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

  const { id, templateId } = await params;

  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : undefined;
    const countryCode =
      typeof body?.country_code === "string"
        ? body.country_code.trim().slice(0, 2).toUpperCase()
        : undefined;
    const templateContent =
      typeof body?.template_content === "string" ? body.template_content : undefined;
    const isDefault = body?.is_default !== undefined ? Boolean(body.is_default) : undefined;

    const existing = await sql`
      SELECT id, company_id FROM invoice_templates
      WHERE id = ${templateId}::uuid AND (company_id = ${id}::uuid OR company_id IS NULL)
    `;
    const existingRow = Array.isArray(existing) ? existing[0] : existing;
    if (!existingRow) {
      return NextResponse.json({ error: "Template introuvable" }, { status: 404 });
    }

    const updates: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];
    let idx = 1;

    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(name);
    }
    if (countryCode !== undefined) {
      updates.push(`country_code = $${idx++}`);
      values.push(countryCode);
    }
    if (templateContent !== undefined) {
      updates.push(`template_content = $${idx++}`);
      values.push(templateContent);
    }
    if (isDefault === true && existingRow.company_id) {
      await sql`
        UPDATE invoice_templates SET is_default = false
        WHERE company_id = ${id}::uuid AND id != ${templateId}::uuid
      `;
      updates.push(`is_default = true`);
    } else if (isDefault === false) {
      updates.push(`is_default = $${idx++}`);
      values.push(false);
    }

    if (updates.length <= 1) {
      return NextResponse.json(
        { error: "Aucun champ à mettre à jour" },
        { status: 400 }
      );
    }

    values.push(templateId);

    const queryText = `
      UPDATE invoice_templates
      SET ${updates.join(", ")}
      WHERE id = $${idx}::uuid
      RETURNING id, company_id, name, country_code, template_content, is_default, created_at, updated_at
    `;
    const result = await sql.query(queryText, values);
    const rows = Array.isArray(result) ? result : [result];
    const row = rows[0];

    return NextResponse.json(row);
  } catch (error) {
    console.error("PATCH /api/accounts/[id]/templates/[templateId] error:", error);
    return NextResponse.json(
      { error: "Échec de la mise à jour" },
      { status: 500 }
    );
  }
}
