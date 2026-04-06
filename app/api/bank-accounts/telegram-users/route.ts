import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";

export async function GET() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez vous reconnecter." },
      { status: 401 },
    );
  }

  try {
    const rows = await sql`
      SELECT ut.telegram_id, ut.telegram_username, u.name AS user_name
      FROM user_telegram ut
      LEFT JOIN neon_auth."user" u ON u.id = ut.user_id
      ORDER BY u.name NULLS LAST, ut.telegram_username NULLS LAST, ut.telegram_id
    `;
    const users = rows.map((r) => ({
      telegram_id: Number(r.telegram_id),
      telegram_username: (r.telegram_username as string | null) ?? undefined,
      name: (r.user_name as string | null) ?? undefined,
    }));
    return NextResponse.json({ users });
  } catch (e) {
    console.error("GET /api/bank-accounts/telegram-users error:", e);
    return NextResponse.json(
      { error: "Impossible de charger les liens Telegram." },
      { status: 500 },
    );
  }
}
