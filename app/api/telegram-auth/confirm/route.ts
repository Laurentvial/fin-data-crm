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
    const code = (body?.code ?? "").toString().trim();
    const password = (body?.password ?? "").toString().trim() || undefined;

    if (!phone || !code) {
      return NextResponse.json(
        { error: "Numéro et code requis." },
        { status: 400 }
      );
    }

    const res = await fetch(`${serviceUrl.replace(/\/$/, "")}/auth/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ phone, code, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      const msg = data.detail ?? data.error ?? "Erreur lors de la confirmation";
      const isPasswordRequired = msg === "password_required" || String(msg).includes("password");
      return NextResponse.json(
        {
          error: isPasswordRequired ? "password_required" : (typeof msg === "string" ? msg : "Erreur lors de la confirmation"),
        },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    console.error("POST /api/telegram-auth/confirm error:", e);
    return NextResponse.json(
      { error: "Service Telegram inaccessible." },
      { status: 502 }
    );
  }
}
