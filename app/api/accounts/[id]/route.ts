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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id } = await params;
  try {
    const rows = await sql`
      SELECT id, name, address, siret, directeur, website,
        country_code, vat_number, vat_rate, invoice_prefix, invoice_next_number, currency,
        invoice_template_id, created_at, updated_at
      FROM companies
      WHERE id = ${id}
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Société introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("GET /api/accounts/[id] error:", error);
    return NextResponse.json(
      { error: "Échec du chargement." },
      { status: 500 }
    );
  }
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
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "Le nom est requis." },
        { status: 400 }
      );
    }
    const address = typeof body?.address === "string" ? body.address.trim() || null : null;
    const siret = typeof body?.siret === "string" ? body.siret.trim() || null : null;
    const directeur = typeof body?.directeur === "string" ? body.directeur.trim() || null : null;
    const website = typeof body?.website === "string" ? body.website.trim() || null : null;
    const countryCode =
      typeof body?.country_code === "string" ? body.country_code.trim().slice(0, 2).toUpperCase() || null : undefined;
    const vatNumber =
      typeof body?.vat_number === "string" ? body.vat_number.trim() || null : undefined;
    const vatRate =
      typeof body?.vat_rate === "number"
        ? body.vat_rate
        : typeof body?.vat_rate === "string"
          ? parseFloat(body.vat_rate)
          : undefined;
    const invoicePrefix =
      typeof body?.invoice_prefix === "string" ? body.invoice_prefix.trim() || null : undefined;
    const currency =
      typeof body?.currency === "string" ? body.currency.trim().slice(0, 3).toUpperCase() || null : undefined;
    const invoiceTemplateId =
      body?.invoice_template_id === null || body?.invoice_template_id === ""
        ? null
        : typeof body?.invoice_template_id === "string"
          ? body.invoice_template_id.trim() || null
          : undefined;

    const updates: string[] = [
      "name = $1",
      "address = $2",
      "siret = $3",
      "directeur = $4",
      "website = $5",
      "updated_at = NOW()",
    ];
    const values: unknown[] = [name, address, siret, directeur, website];
    let idx = 6;
    if (countryCode !== undefined) {
      updates.push(`country_code = $${idx++}`);
      values.push(countryCode);
    }
    if (vatNumber !== undefined) {
      updates.push(`vat_number = $${idx++}`);
      values.push(vatNumber);
    }
    if (vatRate !== undefined && !Number.isNaN(vatRate)) {
      updates.push(`vat_rate = $${idx++}`);
      values.push(vatRate);
    }
    if (invoicePrefix !== undefined) {
      updates.push(`invoice_prefix = $${idx++}`);
      values.push(invoicePrefix);
    }
    if (currency !== undefined) {
      updates.push(`currency = $${idx++}`);
      values.push(currency);
    }
    if (invoiceTemplateId !== undefined) {
      updates.push(`invoice_template_id = $${idx++}`);
      values.push(invoiceTemplateId);
    }
    values.push(id);

    const queryText = `
      UPDATE companies
      SET ${updates.join(", ")}
      WHERE id = $${idx}::uuid
      RETURNING id, name, address, siret, directeur, website, country_code, vat_number, vat_rate, invoice_prefix, invoice_next_number, currency, invoice_template_id, created_at, updated_at
    `;
    const result = await sql.query(queryText, values);
    const rows = Array.isArray(result) ? result : [result];
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Société introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("PATCH /api/accounts/[id] error:", error);
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
    const countRows = await sql`
      SELECT 1 FROM bank_accounts WHERE company_id = ${id} LIMIT 1
    `;
    if (countRows.length > 0) {
      return NextResponse.json(
        { error: "Impossible de supprimer : cette société a des comptes bancaires associés." },
        { status: 400 }
      );
    }
    const rows = await sql`
      DELETE FROM companies WHERE id = ${id} RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Société introuvable." },
        { status: 404 }
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/accounts/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la suppression." },
      { status: 500 }
    );
  }
}
