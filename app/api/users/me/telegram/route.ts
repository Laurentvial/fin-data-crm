import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { AuthDataValidator } from "@telegram-auth/server";

async function requireAuth() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez vous reconnecter." },
      { status: 401 }
    );
  }
  return session;
}

export async function GET() {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  try {
    const [row] = await sql`
      SELECT telegram_id, telegram_username, updated_at
      FROM user_telegram
      WHERE user_id = ${session.user.id}::uuid
    `;
    if (!row) {
      return NextResponse.json({ linked: false });
    }
    return NextResponse.json({
      linked: true,
      telegram_id: Number(row.telegram_id),
      telegram_username: row.telegram_username ?? undefined,
      updated_at: row.updated_at,
    });
  } catch (e) {
    console.error("GET /api/users/me/telegram error:", e);
    return NextResponse.json(
      { error: "Erreur lors de la récupération." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json(
      { error: "Connexion Telegram non configurée (TELEGRAM_BOT_TOKEN)." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Données invalides." },
        { status: 400 }
      );
    }

    const dataMap = new Map<string, string | number>();
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null) {
        dataMap.set(k, typeof v === "number" ? v : String(v));
      }
    }

    const validator = new AuthDataValidator({
      botToken: botToken.trim(),
      inValidateDataAfter: 86400 * 7,
    });
    const user = await validator.validate<{ id: number | string; username?: string }>(dataMap);

    const telegramId = Number(user.id);
    const telegramUsername =
      typeof user.username === "string" && user.username ? user.username : null;

    await sql`
      INSERT INTO user_telegram (user_id, telegram_id, telegram_username, updated_at)
      VALUES (${session.user.id}::uuid, ${telegramId}, ${telegramUsername}, now())
      ON CONFLICT (user_id) DO UPDATE SET
        telegram_id = EXCLUDED.telegram_id,
        telegram_username = EXCLUDED.telegram_username,
        updated_at = now()
    `;

    return NextResponse.json({
      success: true,
      telegram_id: telegramId,
      telegram_username: telegramUsername ?? undefined,
    });
  } catch (e) {
    console.error("POST /api/users/me/telegram error:", e);
    const msg = e instanceof Error ? e.message : "Erreur";
    if (msg.includes("Unauthorized") || msg.includes("validated")) {
      return NextResponse.json(
        { error: "Données Telegram invalides ou expirées." },
        { status: 400 }
      );
    }
    if (msg.includes("Username") && msg.toLowerCase().includes("invalid")) {
      return NextResponse.json(
        {
          error:
            "Nom de bot invalide. Vérifiez NEXT_PUBLIC_TELEGRAM_BOT_USERNAME (sans @) et que le domaine est lié dans BotFather.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Erreur lors de la liaison du compte Telegram." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  try {
    await sql`DELETE FROM user_telegram WHERE user_id = ${session.user.id}::uuid`;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/users/me/telegram error:", e);
    return NextResponse.json(
      { error: "Erreur lors de la déconnexion." },
      { status: 500 }
    );
  }
}
