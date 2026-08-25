import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { canMutate } from "@/lib/auth/permissions";
import { sql } from "@/lib/db";

/** Parse optional string fields: null/"" clears, string trims, missing key skips update. */
function parseOptionalString(
  value: unknown,
  transform?: (value: string) => string
): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const next = transform ? transform(trimmed) : trimmed;
    return next || null;
  }
  return undefined;
}

/** Parse optional date fields sent as ISO string, null, or empty string. */
function parseOptionalDate(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

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
      SELECT c.id, c.name, c.address, c.siret, c.directeur, c.website,
        c.vps, c.forme_juridique, c.capital_social, c.code_postal, c.ville, c.activite, c.date_immatriculation,
        c.source_id, s.name AS source_name,
        c.gerant_adresse, c.gerant_code_postal, c.gerant_ville, c.gerant_pays, c.gerant_date_naissance,
        c.gerant_ville_naissance, c.gerant_code_postal_naissance, c.gerant_pays_naissance,
        c.gerant_numero_fiscal, c.gerant_numero_secu, c.gerant_numero_piece_identite,
        c.country_code, c.vat_number, c.vat_rate, c.vat_rates, c.invoice_prefix, c.invoice_next_number, c.currency,
        c.invoice_template_id, c.bloc_notes, c.created_at, c.updated_at
      FROM companies c
      LEFT JOIN sources s ON s.id = c.source_id
      WHERE c.id = ${id}
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
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "Le nom est requis." },
        { status: 400 }
      );
    }
    const address = parseOptionalString(body?.address) ?? null;
    const siret = parseOptionalString(body?.siret) ?? null;
    const directeur = parseOptionalString(body?.directeur) ?? null;
    const website = parseOptionalString(body?.website) ?? null;
    const vps = parseOptionalString(body?.vps);
    const formeJuridique = parseOptionalString(body?.forme_juridique);
    const capitalSocial = parseOptionalString(body?.capital_social);
    const codePostal = parseOptionalString(body?.code_postal);
    const ville = parseOptionalString(body?.ville);
    const activite = parseOptionalString(body?.activite);
    const dateImmatriculation = parseOptionalDate(body?.date_immatriculation);
    const sourceId = parseOptionalString(body?.source_id);
    const gerantAdresse = parseOptionalString(body?.gerant_adresse);
    const gerantCodePostal = parseOptionalString(body?.gerant_code_postal);
    const gerantVille = parseOptionalString(body?.gerant_ville);
    const gerantPays = parseOptionalString(body?.gerant_pays, (s) => s.slice(0, 2).toUpperCase());
    const gerantDateNaissance = parseOptionalDate(body?.gerant_date_naissance);
    const gerantVilleNaissance = parseOptionalString(body?.gerant_ville_naissance);
    const gerantCodePostalNaissance = parseOptionalString(body?.gerant_code_postal_naissance);
    const gerantPaysNaissance = parseOptionalString(body?.gerant_pays_naissance, (s) => s.slice(0, 2).toUpperCase());
    const gerantNumeroFiscal = parseOptionalString(body?.gerant_numero_fiscal);
    const gerantNumeroSecu = parseOptionalString(body?.gerant_numero_secu);
    const gerantNumeroPieceIdentite = parseOptionalString(body?.gerant_numero_piece_identite);
    const countryCode = parseOptionalString(body?.country_code, (s) => s.slice(0, 2).toUpperCase());
    const vatNumber = parseOptionalString(body?.vat_number);
    const vatRatesRaw = body?.vat_rates;
    const vatRates: number[] | undefined = Array.isArray(vatRatesRaw)
      ? vatRatesRaw
          .map((v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN))
          .filter((n: number) => !Number.isNaN(n) && n >= 0 && n <= 100)
      : undefined;
    const invoicePrefix = parseOptionalString(body?.invoice_prefix);
    const invoiceNextNumber =
      typeof body?.invoice_next_number === "number" && body.invoice_next_number >= 1
        ? Math.floor(body.invoice_next_number)
        : typeof body?.invoice_next_number === "string"
          ? (() => {
              const n = parseInt(body.invoice_next_number, 10);
              return !Number.isNaN(n) && n >= 1 ? n : undefined;
            })()
          : undefined;
    const currency = parseOptionalString(body?.currency, (s) => s.slice(0, 3).toUpperCase());
    const invoiceTemplateId = parseOptionalString(body?.invoice_template_id);
    const blocNotes = parseOptionalString(body?.bloc_notes);

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
    if (vps !== undefined) {
      updates.push(`vps = $${idx++}`);
      values.push(vps);
    }
    if (formeJuridique !== undefined) {
      updates.push(`forme_juridique = $${idx++}`);
      values.push(formeJuridique);
    }
    if (capitalSocial !== undefined) {
      updates.push(`capital_social = $${idx++}`);
      values.push(capitalSocial);
    }
    if (codePostal !== undefined) {
      updates.push(`code_postal = $${idx++}`);
      values.push(codePostal);
    }
    if (ville !== undefined) {
      updates.push(`ville = $${idx++}`);
      values.push(ville);
    }
    if (activite !== undefined) {
      updates.push(`activite = $${idx++}`);
      values.push(activite);
    }
    if (dateImmatriculation !== undefined) {
      updates.push(`date_immatriculation = $${idx++}`);
      values.push(dateImmatriculation);
    }
    if (sourceId !== undefined) {
      updates.push(`source_id = $${idx++}`);
      values.push(sourceId);
    }
    if (gerantAdresse !== undefined) {
      updates.push(`gerant_adresse = $${idx++}`);
      values.push(gerantAdresse);
    }
    if (gerantCodePostal !== undefined) {
      updates.push(`gerant_code_postal = $${idx++}`);
      values.push(gerantCodePostal);
    }
    if (gerantVille !== undefined) {
      updates.push(`gerant_ville = $${idx++}`);
      values.push(gerantVille);
    }
    if (gerantPays !== undefined) {
      updates.push(`gerant_pays = $${idx++}`);
      values.push(gerantPays);
    }
    if (gerantDateNaissance !== undefined) {
      updates.push(`gerant_date_naissance = $${idx++}`);
      values.push(gerantDateNaissance);
    }
    if (gerantVilleNaissance !== undefined) {
      updates.push(`gerant_ville_naissance = $${idx++}`);
      values.push(gerantVilleNaissance);
    }
    if (gerantCodePostalNaissance !== undefined) {
      updates.push(`gerant_code_postal_naissance = $${idx++}`);
      values.push(gerantCodePostalNaissance);
    }
    if (gerantPaysNaissance !== undefined) {
      updates.push(`gerant_pays_naissance = $${idx++}`);
      values.push(gerantPaysNaissance);
    }
    if (gerantNumeroFiscal !== undefined) {
      updates.push(`gerant_numero_fiscal = $${idx++}`);
      values.push(gerantNumeroFiscal);
    }
    if (gerantNumeroSecu !== undefined) {
      updates.push(`gerant_numero_secu = $${idx++}`);
      values.push(gerantNumeroSecu);
    }
    if (gerantNumeroPieceIdentite !== undefined) {
      updates.push(`gerant_numero_piece_identite = $${idx++}`);
      values.push(gerantNumeroPieceIdentite);
    }
    if (countryCode !== undefined) {
      updates.push(`country_code = $${idx++}`);
      values.push(countryCode);
    }
    if (vatNumber !== undefined) {
      updates.push(`vat_number = $${idx++}`);
      values.push(vatNumber);
    }
    if (vatRates !== undefined && vatRates.length > 0) {
      updates.push(`vat_rates = $${idx++}::jsonb`);
      values.push(JSON.stringify(vatRates));
      updates.push(`vat_rate = $${idx++}`);
      values.push(vatRates[0]);
    }
    if (invoicePrefix !== undefined) {
      updates.push(`invoice_prefix = $${idx++}`);
      values.push(invoicePrefix);
    }
    if (invoiceNextNumber !== undefined) {
      updates.push(`invoice_next_number = $${idx++}`);
      values.push(invoiceNextNumber);
    }
    if (currency !== undefined) {
      updates.push(`currency = $${idx++}`);
      values.push(currency);
    }
    if (invoiceTemplateId !== undefined) {
      updates.push(`invoice_template_id = $${idx++}`);
      values.push(invoiceTemplateId);
    }
    if (blocNotes !== undefined) {
      updates.push(`bloc_notes = $${idx++}`);
      values.push(blocNotes);
    }
    values.push(id);

    const queryText = `
      UPDATE companies
      SET ${updates.join(", ")}
      WHERE id = $${idx}::uuid
      RETURNING id, name, address, siret, directeur, website, vps, forme_juridique, capital_social, code_postal, ville, activite, date_immatriculation, source_id, gerant_adresse, gerant_code_postal, gerant_ville, gerant_pays, gerant_date_naissance, gerant_ville_naissance, gerant_code_postal_naissance, gerant_pays_naissance, gerant_numero_fiscal, gerant_numero_secu, gerant_numero_piece_identite, country_code, vat_number, vat_rate, vat_rates, invoice_prefix, invoice_next_number, currency, invoice_template_id, bloc_notes, created_at, updated_at
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
