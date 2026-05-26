import { NextResponse } from "next/server";
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
    const address = typeof body?.address === "string" ? body.address.trim() || null : null;
    const siret = typeof body?.siret === "string" ? body.siret.trim() || null : null;
    const directeur = typeof body?.directeur === "string" ? body.directeur.trim() || null : null;
    const website = typeof body?.website === "string" ? body.website.trim() || null : null;
    const vps = typeof body?.vps === "string" ? body.vps.trim() || null : undefined;
    const formeJuridique = typeof body?.forme_juridique === "string" ? body.forme_juridique.trim() || null : undefined;
    const capitalSocial = typeof body?.capital_social === "string" ? body.capital_social.trim() || null : undefined;
    const codePostal = typeof body?.code_postal === "string" ? body.code_postal.trim() || null : undefined;
    const ville = typeof body?.ville === "string" ? body.ville.trim() || null : undefined;
    const activite = typeof body?.activite === "string" ? body.activite.trim() || null : undefined;
    const dateImmatriculation =
      typeof body?.date_immatriculation === "string" && body.date_immatriculation.trim()
        ? body.date_immatriculation.trim()
        : body?.date_immatriculation === null || body?.date_immatriculation === ""
          ? null
          : undefined;
    const sourceId = typeof body?.source_id === "string" ? body.source_id.trim() || null : body?.source_id === null || body?.source_id === "" ? null : undefined;
    const gerantAdresse = typeof body?.gerant_adresse === "string" ? body.gerant_adresse.trim() || null : undefined;
    const gerantCodePostal = typeof body?.gerant_code_postal === "string" ? body.gerant_code_postal.trim() || null : undefined;
    const gerantVille = typeof body?.gerant_ville === "string" ? body.gerant_ville.trim() || null : undefined;
    const gerantPays = typeof body?.gerant_pays === "string" ? body.gerant_pays.trim().slice(0, 2).toUpperCase() || null : undefined;
    const gerantDateNaissance =
      typeof body?.gerant_date_naissance === "string" && body.gerant_date_naissance.trim()
        ? body.gerant_date_naissance.trim()
        : body?.gerant_date_naissance === null || body?.gerant_date_naissance === "" ? null : undefined;
    const gerantVilleNaissance = typeof body?.gerant_ville_naissance === "string" ? body.gerant_ville_naissance.trim() || null : undefined;
    const gerantCodePostalNaissance = typeof body?.gerant_code_postal_naissance === "string" ? body.gerant_code_postal_naissance.trim() || null : undefined;
    const gerantPaysNaissance = typeof body?.gerant_pays_naissance === "string" ? body.gerant_pays_naissance.trim().slice(0, 2).toUpperCase() || null : undefined;
    const gerantNumeroFiscal = typeof body?.gerant_numero_fiscal === "string" ? body.gerant_numero_fiscal.trim() || null : undefined;
    const gerantNumeroSecu = typeof body?.gerant_numero_secu === "string" ? body.gerant_numero_secu.trim() || null : undefined;
    const gerantNumeroPieceIdentite = typeof body?.gerant_numero_piece_identite === "string" ? body.gerant_numero_piece_identite.trim() || null : undefined;
    const countryCode =
      typeof body?.country_code === "string" ? body.country_code.trim().slice(0, 2).toUpperCase() || null : undefined;
    const vatNumber =
      typeof body?.vat_number === "string" ? body.vat_number.trim() || null : undefined;
    const vatRatesRaw = body?.vat_rates;
    const vatRates: number[] | undefined = Array.isArray(vatRatesRaw)
      ? vatRatesRaw
          .map((v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN))
          .filter((n: number) => !Number.isNaN(n) && n >= 0 && n <= 100)
      : undefined;
    const invoicePrefix =
      typeof body?.invoice_prefix === "string" ? body.invoice_prefix.trim() || null : undefined;
    const invoiceNextNumber =
      typeof body?.invoice_next_number === "number" && body.invoice_next_number >= 1
        ? Math.floor(body.invoice_next_number)
        : typeof body?.invoice_next_number === "string"
          ? (() => {
              const n = parseInt(body.invoice_next_number, 10);
              return !Number.isNaN(n) && n >= 1 ? n : undefined;
            })()
          : undefined;
    const currency =
      typeof body?.currency === "string" ? body.currency.trim().slice(0, 3).toUpperCase() || null : undefined;
    const invoiceTemplateId =
      body?.invoice_template_id === null || body?.invoice_template_id === ""
        ? null
        : typeof body?.invoice_template_id === "string"
          ? body.invoice_template_id.trim() || null
          : undefined;
    const blocNotes =
      body?.bloc_notes === null || body?.bloc_notes === ""
        ? null
        : typeof body?.bloc_notes === "string"
          ? body.bloc_notes.trim() || null
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
