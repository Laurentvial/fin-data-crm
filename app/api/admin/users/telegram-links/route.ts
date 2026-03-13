import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";

export async function GET() {
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

  try {
    const rows = await sql`
      SELECT user_id, telegram_id, telegram_username
      FROM user_telegram
    `;
    const links = rows.map((r) => ({
      user_id: r.user_id,
      telegram_id: Number(r.telegram_id),
      telegram_username: r.telegram_username ?? undefined,
    }));
    return NextResponse.json({ links });
  } catch (e) {
    console.error("GET /api/admin/users/telegram-links error:", e);
    return NextResponse.json(
      { error: "Erreur lors de la récupération." },
      { status: 500 }
    );
  }
}
