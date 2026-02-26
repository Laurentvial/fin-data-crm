import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { AuthDataValidator } from "@telegram-auth/server";

function getBaseUrl(request: NextRequest): string {
  const envUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.redirect(`${baseUrl}/auth/sign-in?callbackUrl=/settings`);
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    return NextResponse.redirect(`${baseUrl}/settings?telegram_error=config`);
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const hash = searchParams.get("hash");

  if (!id || !hash) {
    return NextResponse.redirect(`${baseUrl}/settings?telegram_error=invalid`);
  }

  const userData: Record<string, string | number> = {};
  const keys = ["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"];
  for (const key of keys) {
    const val = searchParams.get(key);
    if (val != null) {
      userData[key] = val;
    }
  }

  try {
    const dataMap = new Map<string, string | number>();
    for (const [k, v] of Object.entries(userData)) {
      if (v !== undefined && v !== null) {
        dataMap.set(k, typeof v === "number" ? v : String(v));
      }
    }

    const validator = new AuthDataValidator({
      botToken,
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

    return NextResponse.redirect(`${baseUrl}/settings/telegram-success`);
  } catch (e) {
    console.error("Telegram callback validation error:", e);
    return NextResponse.redirect(`${baseUrl}/settings?telegram_error=invalid`);
  }
}
