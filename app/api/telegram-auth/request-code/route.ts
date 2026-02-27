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

  const serviceUrl = process.env.TELEGRAM_GROUP_SERVICE_URL;
  const apiKey = process.env.TELEGRAM_SERVICE_API_KEY;
  if (!serviceUrl || !apiKey) {
    return NextResponse.json(
      { error: "Service Telegram non configuré." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const phone = (body?.phone ?? "").toString().trim();
    if (!phone) {
      return NextResponse.json(
        { error: "Numéro de téléphone requis." },
        { status: 400 }
      );
    }

    const res = await fetch(`${serviceUrl.replace(/\/$/, "")}/auth/request-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();

    if (!res.ok) {
      const msg = data.detail ?? data.error ?? "Erreur lors de l'envoi du code";
      return NextResponse.json(
        { error: typeof msg === "string" ? msg : "Erreur lors de l'envoi du code" },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    console.error("POST /api/telegram-auth/request-code error:", e);
    return NextResponse.json(
      { error: "Service Telegram inaccessible." },
      { status: 502 }
    );
  }
}
