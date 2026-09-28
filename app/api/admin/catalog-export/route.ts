import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import {
  CatalogTransferError,
  exportCatalog,
  isCatalogEntity,
} from "@/lib/catalog-transfer";

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

export async function GET(request: NextRequest) {
  const { data: session } = await auth.getSession();
  const err = await requireAdmin(session?.user as { id: string; role?: string } | undefined);
  if (err) return err;

  const entity = request.nextUrl.searchParams.get("entity");
  if (!isCatalogEntity(entity)) {
    return NextResponse.json(
      { error: "Paramètre entity invalide. Utilisez templates, clients, sources ou banks." },
      { status: 400 }
    );
  }

  try {
    const payload = await exportCatalog(entity);
    const date = payload.exported_at.slice(0, 10);
    const filename = `bigboss-${entity}-${date}.json`;
    return NextResponse.json(payload, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("GET /api/admin/catalog-export:", e);
    if (e instanceof CatalogTransferError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: "Échec de l'export du catalogue." },
      { status: 500 }
    );
  }
}
