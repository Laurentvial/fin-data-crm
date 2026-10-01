import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { canMutate } from "@/lib/auth/permissions";
import { EntityTransferError, importEntities } from "@/lib/entity-transfer";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  if (!canMutate(session.user.role)) {
    return NextResponse.json(
      { error: "Accès refusé: rôle lecteur en lecture seule." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const result = await importEntities(body);
    return NextResponse.json(result);
  } catch (e) {
    console.error("POST /api/entity-import:", e);
    if (e instanceof EntityTransferError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof SyntaxError) {
      return NextResponse.json({ error: "Fichier JSON illisible." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Échec de l'import." },
      { status: 500 }
    );
  }
}
