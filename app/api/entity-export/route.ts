import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { canMutate } from "@/lib/auth/permissions";
import {
  EntityTransferError,
  exportEntities,
  isEntityTransferEntity,
} from "@/lib/entity-transfer";

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
    if (!isEntityTransferEntity(body?.entity)) {
      return NextResponse.json(
        { error: "Paramètre entity invalide. Utilisez companies ou bank_accounts." },
        { status: 400 }
      );
    }
    const payload = await exportEntities(body.entity, body?.ids);
    const date = payload.exported_at.slice(0, 10);
    const filename = `bigboss-${payload.entity}-${date}.json`;
    return NextResponse.json(payload, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("POST /api/entity-export:", e);
    if (e instanceof EntityTransferError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: "Échec de l'export." },
      { status: 500 }
    );
  }
}
