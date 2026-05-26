import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { canMutate } from "@/lib/auth/permissions";
import { sql } from "@/lib/db";

function parseBackgroundColor(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || !/^#[0-9A-Fa-f]{6}$/.test(s)) return null;
  return s;
}

function parseBackgroundOpacity(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

async function requireAuth() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez vous reconnecter." },
      { status: 401 }
    );
  }
  return null;
}

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const rows = await sql`
      SELECT id, name, sort_order, is_default, background_color, background_opacity, emoji, created_at, updated_at
      FROM account_statuses
      ORDER BY sort_order, name
    `;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/account-statuses error:", error);
    return NextResponse.json(
      { error: "Échec du chargement des statuts de comptes." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez vous reconnecter." },
      { status: 401 }
    );
  }
  if (!canMutate(session.user.role)) {
    return NextResponse.json(
      { error: "Accès refusé: rôle lecteur en lecture seule." },
      { status: 403 }
    );
  }
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "Le nom du statut de compte est requis." },
        { status: 400 }
      );
    }
    const sortOrder = typeof body?.sort_order === "number" ? body.sort_order : 0;
    const [existingCount] = await sql`SELECT 1 FROM account_statuses LIMIT 1`;
    const isFirst = !existingCount;
    const isDefault = body?.is_default === true || isFirst;
    const backgroundColor = parseBackgroundColor(body?.background_color);
    const backgroundOpacity = parseBackgroundOpacity(body?.background_opacity);
    const emoji = typeof body?.emoji === "string" ? body.emoji.trim() || null : null;
    const rows = await sql`
      INSERT INTO account_statuses (name, sort_order, is_default, background_color, background_opacity, emoji)
      VALUES (${name}, ${sortOrder}, ${isDefault}, ${backgroundColor}, ${backgroundOpacity}, ${emoji})
      RETURNING id, name, sort_order, is_default, background_color, background_opacity, emoji, created_at, updated_at
    `;
    if (isDefault) {
      await sql`UPDATE account_statuses SET is_default = false WHERE id != ${rows[0].id}::uuid`;
    }
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Échec de la création du statut de compte." },
        { status: 500 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("POST /api/account-statuses error:", error);
    return NextResponse.json(
      { error: "Échec de la création du statut de compte." },
      { status: 500 }
    );
  }
}
