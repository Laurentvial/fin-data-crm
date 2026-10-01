import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { callTelegramGroupService } from "@/lib/telegram-group-service";

async function requireAdmin() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez vous reconnecter." },
      { status: 401 }
    );
  }
  if ((session.user as { role?: string }).role !== "admin") {
    return NextResponse.json(
      { error: "Accès réservé aux administrateurs." },
      { status: 403 }
    );
  }
  return null;
}

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const phone = (body?.phone ?? "").toString().trim();
  const code = (body?.code ?? "").toString().trim();
  const password = (body?.password ?? "").toString().trim() || undefined;

  if (!phone || !code) {
    return NextResponse.json(
      { error: "Numéro et code requis." },
      { status: 400 }
    );
  }

  const result = await callTelegramGroupService("/auth/confirm", {
    method: "POST",
    body: { phone, code, password },
  });
  if (!result.ok) {
    const isPasswordRequired =
      result.error === "password_required" || result.error.includes("password");
    return NextResponse.json(
      { error: isPasswordRequired ? "password_required" : result.error },
      { status: result.status }
    );
  }
  return NextResponse.json(result.data);
}
