import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { fetchCompanyFromPappers } from "@/lib/pappers/fetch-company";

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

export async function POST(request: Request) {
  const authError = await requireAuth();
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const o = body as { sirenOrSiret?: unknown; siret?: unknown; siren?: unknown };
  const asStr = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(Math.abs(v)));
    return "";
  };
  const raw =
    asStr(o.sirenOrSiret) ||
    asStr(o.siret) ||
    asStr(o.siren);

  if (!raw.replace(/\D/g, "")) {
    return NextResponse.json(
      { error: "Indiquez sirenOrSiret, siret ou siren (9 ou 14 chiffres)." },
      { status: 400 }
    );
  }

  const result = await fetchCompanyFromPappers(raw.replace(/\D/g, ""));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.data);
}
