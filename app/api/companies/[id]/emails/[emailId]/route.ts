import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";

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
  request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id, emailId } = await params;
  const { searchParams } = new URL(request.url);
  const showPassword = searchParams.get("password") === "1";
  try {
    const rows = await sql`
      SELECT id, company_id, email, password, created_at, updated_at
      FROM company_emails
      WHERE id = ${emailId} AND company_id = ${id}
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Email introuvable." },
        { status: 404 }
      );
    }
    const out: Record<string, unknown> = {
      id: row.id,
      company_id: row.company_id,
      email: row.email,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    if (showPassword && row.password) {
      try {
        out.password = decrypt(row.password as string);
      } catch {
        out.password = null;
      }
    }
    return NextResponse.json(out);
  } catch (error) {
    console.error("GET /api/companies/[id]/emails/[emailId] error:", error);
    return NextResponse.json(
      { error: "Échec du chargement." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id, emailId } = await params;
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim() : undefined;
    const password = typeof body?.password === "string" ? body.password : undefined;

    const existing = await sql`
      SELECT id FROM company_emails
      WHERE id = ${emailId} AND company_id = ${id}
    `;
    if (existing.length === 0) {
      return NextResponse.json(
        { error: "Email introuvable." },
        { status: 404 }
      );
    }

    if (email !== undefined && !email) {
      return NextResponse.json(
        { error: "L'email ne peut pas être vide." },
        { status: 400 }
      );
    }

    if (email !== undefined && password !== undefined) {
      const r = await sql`
        UPDATE company_emails
        SET email = ${email}, password = ${encrypt(password)}, updated_at = NOW()
        WHERE id = ${emailId} AND company_id = ${id}
        RETURNING id, company_id, email, created_at, updated_at
      `;
      const row = r[0];
      if (!row) {
        return NextResponse.json({ error: "Échec de la mise à jour." }, { status: 500 });
      }
      return NextResponse.json(row);
    }
    if (email !== undefined) {
      const r = await sql`
        UPDATE company_emails
        SET email = ${email}, updated_at = NOW()
        WHERE id = ${emailId} AND company_id = ${id}
        RETURNING id, company_id, email, created_at, updated_at
      `;
      const row = r[0];
      if (!row) {
        return NextResponse.json({ error: "Échec de la mise à jour." }, { status: 500 });
      }
      return NextResponse.json(row);
    }
    if (password !== undefined) {
      const r = await sql`
        UPDATE company_emails
        SET password = ${encrypt(password)}, updated_at = NOW()
        WHERE id = ${emailId} AND company_id = ${id}
        RETURNING id, company_id, email, created_at, updated_at
      `;
      const row = r[0];
      if (!row) {
        return NextResponse.json({ error: "Échec de la mise à jour." }, { status: 500 });
      }
      return NextResponse.json(row);
    }
    return NextResponse.json({ error: "Aucune modification." }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/companies/[id]/emails/[emailId] error:", error);
    return NextResponse.json(
      { error: "Échec de la mise à jour." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id, emailId } = await params;
  try {
    const rows = await sql`
      DELETE FROM company_emails
      WHERE id = ${emailId} AND company_id = ${id}
      RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Email introuvable." },
        { status: 404 }
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/companies/[id]/emails/[emailId] error:", error);
    return NextResponse.json(
      { error: "Échec de la suppression." },
      { status: 500 }
    );
  }
}
