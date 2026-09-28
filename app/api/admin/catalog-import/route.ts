import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { CatalogTransferError, importCatalog } from "@/lib/catalog-transfer";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function requireAdmin(sessionUser: { id: string; role?: string } | undefined) {
  if (!sessionUser) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  if (sessionUser.role !== "admin") {
    return NextResponse.json(
      { error: "Accès réservé aux administrateurs." },
      { status: 403 }
    );
  }
  return null;
}

export async function POST(request: NextRequest) {
  const { data: session } = await auth.getSession();
  const err = await requireAdmin(session?.user as { id: string; role?: string } | undefined);
  if (err) return err;

  try {
    const body = await request.json();
    const result = await importCatalog(body);
    return NextResponse.json(result);
  } catch (e) {
    console.error("POST /api/admin/catalog-import:", e);
    if (e instanceof CatalogTransferError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Fichier JSON illisible." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Échec de l'import du catalogue." },
      { status: 500 }
    );
  }
}
