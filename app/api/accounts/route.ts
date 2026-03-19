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

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const rows = await sql`
      SELECT
        c.id,
        c.name,
        c.address,
        c.siret,
        c.directeur,
        c.website,
        c.vps,
        c.forme_juridique,
        c.capital_social,
        c.code_postal,
        c.ville,
        c.activite,
        c.date_immatriculation,
        c.fournisseur,
        c.gerant_adresse,
        c.gerant_code_postal,
        c.gerant_ville,
        c.gerant_pays,
        c.gerant_date_naissance,
        c.gerant_ville_naissance,
        c.gerant_code_postal_naissance,
        c.gerant_pays_naissance,
        c.gerant_numero_fiscal,
        c.gerant_numero_secu,
        c.gerant_numero_piece_identite,
        c.country_code,
        c.vat_number,
        c.vat_rate,
        c.invoice_prefix,
        c.invoice_next_number,
        c.currency,
        c.bloc_notes,
        c.created_at,
        c.updated_at,
        EXISTS(SELECT 1 FROM company_files WHERE company_id = c.id AND file_type = 'logo') AS has_logo,
        COALESCE(
          (SELECT array_agg(bank_id) FROM (
            SELECT DISTINCT bank_id FROM bank_accounts
            WHERE company_id = c.id AND bank_id IS NOT NULL
          ) sub),
          ARRAY[]::uuid[]
        ) AS bank_ids,
        COALESCE(
          (SELECT array_agg(email ORDER BY email) FROM company_emails WHERE company_id = c.id),
          ARRAY[]::text[]
        ) AS emails,
        COALESCE(
          (SELECT array_agg(phone ORDER BY phone) FROM company_phones WHERE company_id = c.id),
          ARRAY[]::text[]
        ) AS phones
      FROM companies c
      ORDER BY c.name
    `;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/accounts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch companies" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authError = await requireAuth();
  if (authError) return authError;
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
    const vps = typeof body?.vps === "string" ? body.vps.trim() || null : null;
    const formeJuridique = typeof body?.forme_juridique === "string" ? body.forme_juridique.trim() || null : null;
    const capitalSocial = typeof body?.capital_social === "string" ? body.capital_social.trim() || null : null;
    const codePostal = typeof body?.code_postal === "string" ? body.code_postal.trim() || null : null;
    const ville = typeof body?.ville === "string" ? body.ville.trim() || null : null;
    const activite = typeof body?.activite === "string" ? body.activite.trim() || null : null;
    const dateImmatriculation = typeof body?.date_immatriculation === "string" && body.date_immatriculation.trim()
      ? body.date_immatriculation.trim()
      : null;
    const countryCode =
      typeof body?.country_code === "string" ? body.country_code.trim().slice(0, 2).toUpperCase() || "FR" : "FR";
    const fournisseur = typeof body?.fournisseur === "string" ? body.fournisseur.trim() || null : null;
    const gerantAdresse = typeof body?.gerant_adresse === "string" ? body.gerant_adresse.trim() || null : null;
    const gerantCodePostal = typeof body?.gerant_code_postal === "string" ? body.gerant_code_postal.trim() || null : null;
    const gerantVille = typeof body?.gerant_ville === "string" ? body.gerant_ville.trim() || null : null;
    const gerantPays = typeof body?.gerant_pays === "string" ? body.gerant_pays.trim().slice(0, 2).toUpperCase() || null : null;
    const gerantDateNaissance = typeof body?.gerant_date_naissance === "string" && body.gerant_date_naissance.trim() ? body.gerant_date_naissance.trim() : null;
    const gerantVilleNaissance = typeof body?.gerant_ville_naissance === "string" ? body.gerant_ville_naissance.trim() || null : null;
    const gerantCodePostalNaissance = typeof body?.gerant_code_postal_naissance === "string" ? body.gerant_code_postal_naissance.trim() || null : null;
    const gerantPaysNaissance = typeof body?.gerant_pays_naissance === "string" ? body.gerant_pays_naissance.trim().slice(0, 2).toUpperCase() || null : null;
    const gerantNumeroFiscal = typeof body?.gerant_numero_fiscal === "string" ? body.gerant_numero_fiscal.trim() || null : null;
    const gerantNumeroSecu = typeof body?.gerant_numero_secu === "string" ? body.gerant_numero_secu.trim() || null : null;
    const gerantNumeroPieceIdentite = typeof body?.gerant_numero_piece_identite === "string" ? body.gerant_numero_piece_identite.trim() || null : null;
    const vatNumber = typeof body?.vat_number === "string" ? body.vat_number.trim() || null : null;
    const vatRate =
      typeof body?.vat_rate === "number"
        ? body.vat_rate
        : typeof body?.vat_rate === "string"
          ? parseFloat(body.vat_rate)
          : 20;
    const invoicePrefix = typeof body?.invoice_prefix === "string" ? body.invoice_prefix.trim() || "FAC-" : "FAC-";
    const invoiceNextNumber =
      typeof body?.invoice_next_number === "number" && body.invoice_next_number >= 1
        ? Math.floor(body.invoice_next_number)
        : typeof body?.invoice_next_number === "string"
          ? (() => {
              const n = parseInt(body.invoice_next_number, 10);
              return !Number.isNaN(n) && n >= 1 ? n : 1;
            })()
          : 1;
    const currency = typeof body?.currency === "string" ? body.currency.trim().slice(0, 3).toUpperCase() || "EUR" : "EUR";
    const blocNotes = typeof body?.bloc_notes === "string" ? body.bloc_notes.trim() || null : null;
    const rows = await sql`
      INSERT INTO companies (name, address, siret, directeur, website, vps, forme_juridique, capital_social, code_postal, ville, activite, date_immatriculation, country_code, fournisseur, gerant_adresse, gerant_code_postal, gerant_ville, gerant_pays, gerant_date_naissance, gerant_ville_naissance, gerant_code_postal_naissance, gerant_pays_naissance, gerant_numero_fiscal, gerant_numero_secu, gerant_numero_piece_identite, vat_number, vat_rate, invoice_prefix, invoice_next_number, currency, bloc_notes)
      VALUES (${name}, ${address}, ${siret}, ${directeur}, ${website}, ${vps}, ${formeJuridique}, ${capitalSocial}, ${codePostal}, ${ville}, ${activite}, ${dateImmatriculation}, ${countryCode}, ${fournisseur}, ${gerantAdresse}, ${gerantCodePostal}, ${gerantVille}, ${gerantPays}, ${gerantDateNaissance}, ${gerantVilleNaissance}, ${gerantCodePostalNaissance}, ${gerantPaysNaissance}, ${gerantNumeroFiscal}, ${gerantNumeroSecu}, ${gerantNumeroPieceIdentite}, ${vatNumber}, ${vatRate}, ${invoicePrefix}, ${invoiceNextNumber}, ${currency}, ${blocNotes})
      RETURNING id, name, address, siret, directeur, website, vps, forme_juridique, capital_social, code_postal, ville, activite, date_immatriculation, fournisseur, gerant_adresse, gerant_code_postal, gerant_ville, gerant_pays, gerant_date_naissance, gerant_ville_naissance, gerant_code_postal_naissance, gerant_pays_naissance, gerant_numero_fiscal, gerant_numero_secu, gerant_numero_piece_identite, invoice_prefix, invoice_next_number, currency, country_code, vat_number, vat_rate, invoice_template_id, bloc_notes, created_at, updated_at
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Échec de la création." },
        { status: 500 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("POST /api/accounts error:", error);
    return NextResponse.json(
      { error: "Échec de la création de la société." },
      { status: 500 }
    );
  }
}
