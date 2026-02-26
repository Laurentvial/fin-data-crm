import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

async function requireAdmin() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez vous reconnecter." },
      { status: 401 }
    );
  }
  if (session.user.role !== "admin") {
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

  const serviceUrl = process.env.TELEGRAM_GROUP_SERVICE_URL;
  const apiKey = process.env.TELEGRAM_SERVICE_API_KEY;
  if (!serviceUrl || !apiKey) {
    return NextResponse.json(
      { authorized: false, error: "Service Telegram non configuré." },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(`${serviceUrl.replace(/\/$/, "")}/auth/status`, {
      headers: { "X-API-Key": apiKey },
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { authorized: false, error: data.detail ?? "Erreur du service" },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    console.error("GET /api/telegram-auth/status error:", e);
    return NextResponse.json(
      { authorized: false, error: "Service Telegram inaccessible." },
      { status: 502 }
    );
  }
}
