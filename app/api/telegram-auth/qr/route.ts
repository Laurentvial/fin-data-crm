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

export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;

  const result = await callTelegramGroupService("/auth/qr/status");
  if (!result.ok) {
    return NextResponse.json({ status: "error", error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}

export async function POST() {
  const authError = await requireAdmin();
  if (authError) return authError;

  const result = await callTelegramGroupService("/auth/qr/start", { method: "POST" });
  if (!result.ok) {
    return NextResponse.json({ status: "error", error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
