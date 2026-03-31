import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { isAppSuperAdmin } from "@/lib/app-super-admin";

async function requireAdmin(sessionUser: { id: string; role?: string } | undefined) {
  if (!sessionUser) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  if (sessionUser.role !== "admin") {
    return NextResponse.json(
      { error: "Accès réservé aux administrateurs." },
      { status: 403 }
    );
  }
  return null;
}

export async function GET() {
  const { data: session } = await auth.getSession();
  const err = await requireAdmin(session?.user as { id: string; role?: string } | undefined);
  if (err) return err;
  try {
    const rows = await sql`
      SELECT user_id::text AS user_id
      FROM app_super_admins
      ORDER BY created_at
    `;
    const list = Array.isArray(rows) ? rows : rows != null ? [rows] : [];
    const user_ids = (list as { user_id: string }[]).map((r) => r.user_id);
    return NextResponse.json({ user_ids });
  } catch (e) {
    console.error("GET /api/admin/app-super-admins:", e);
    return NextResponse.json({ error: "Échec du chargement." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { data: session } = await auth.getSession();
  const err = await requireAdmin(session?.user as { id: string; role?: string } | undefined);
  if (err) return err;
  try {
    const body = await request.json();
    const userId = typeof body.user_id === "string" ? body.user_id : null;
    if (!userId) {
      return NextResponse.json({ error: "user_id requis." }, { status: 400 });
    }
    await sql`
      INSERT INTO app_super_admins (user_id)
      VALUES (${userId}::uuid)
      ON CONFLICT (user_id) DO NOTHING
    `;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/admin/app-super-admins:", e);
    return NextResponse.json({ error: "Échec de l'ajout." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { data: session } = await auth.getSession();
  const sessionUser = session?.user as { id: string; role?: string } | undefined;
  const err = await requireAdmin(sessionUser);
  if (err) return err;
  const userId = new URL(request.url).searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id requis." }, { status: 400 });
  }
  if (userId === sessionUser?.id) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas retirer votre propre accès super-admin." },
      { status: 400 }
    );
  }
  try {
    const wasSuper = await isAppSuperAdmin(userId);
    if (!wasSuper) {
      return NextResponse.json({ ok: true });
    }
    await sql`DELETE FROM app_super_admins WHERE user_id = ${userId}::uuid`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/admin/app-super-admins:", e);
    return NextResponse.json({ error: "Échec de la suppression." }, { status: 500 });
  }
}
