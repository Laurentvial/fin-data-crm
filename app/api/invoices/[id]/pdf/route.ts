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
      SELECT pdf_url FROM invoices WHERE id = ${id}::uuid
    `;
    const row = Array.isArray(rows) ? rows[0] : rows;

    if (!row?.pdf_url) {
      return NextResponse.json({ error: "PDF introuvable" }, { status: 404 });
    }

    const pdfUrl = row.pdf_url as string;
    const res = await fetch(pdfUrl);
    if (!res.ok) {
      return NextResponse.json({ error: "PDF introuvable" }, { status: 404 });
    }

    const blob = await res.blob();
    return new NextResponse(blob, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/[id]/pdf error:", error);
    return NextResponse.json(
      { error: "Échec du chargement du PDF" },
      { status: 500 }
    );
  }
}
