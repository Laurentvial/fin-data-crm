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

export async function GET(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("company_id") ?? null;
    const q = searchParams.get("q") ?? "";

    if (!companyId) {
      return NextResponse.json(
        { error: "company_id est requis" },
        { status: 400 }
      );
    }

    const searchTerm = typeof q === "string" ? q.trim().toLowerCase() : "";
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

    const rows = searchTerm
      ? await sql`
          SELECT id, company_id, name, address, vat_number, created_at
          FROM customers
          WHERE company_id = ${companyId}::uuid
            AND (
              lower(name) LIKE ${"%" + searchTerm + "%"}
              OR (address IS NOT NULL AND lower(address) LIKE ${"%" + searchTerm + "%"})
              OR (vat_number IS NOT NULL AND lower(vat_number) LIKE ${"%" + searchTerm + "%"})
            )
          ORDER BY name ASC
          LIMIT ${limit}
        `
      : await sql`
          SELECT id, company_id, name, address, vat_number, created_at
          FROM customers
          WHERE company_id = ${companyId}::uuid
          ORDER BY name ASC
          LIMIT ${limit}
        `;

    const customers = (Array.isArray(rows) ? rows : [rows]).map((r) => ({
      id: r.id,
      company_id: r.company_id,
      name: r.name,
      address: r.address ?? null,
      vat_number: r.vat_number ?? null,
      created_at: r.created_at,
    }));

    return NextResponse.json(customers);
  } catch (error) {
    console.error("GET /api/customers error:", error);
    return NextResponse.json(
      { error: "Échec du chargement des clients" },
      { status: 500 }
    );
  }
}
