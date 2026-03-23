import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id } = await params;
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : undefined;
    const sortOrder = typeof body?.sort_order === "number" ? body.sort_order : undefined;
    const isDefault = body?.is_default;
    const backgroundColorInBody = "background_color" in body;
    const backgroundOpacityInBody = "background_opacity" in body;
    const emojiInBody = "emoji" in body;
    if (!name && sortOrder === undefined && isDefault === undefined && !backgroundColorInBody && !backgroundOpacityInBody && !emojiInBody) {
      return NextResponse.json(
        { error: "Aucune modification fournie." },
        { status: 400 }
      );
    }
    if (name !== undefined && !name) {
      return NextResponse.json(
        { error: "Le nom du statut de compte ne peut pas être vide." },
        { status: 400 }
      );
    }
    const [existing] = await sql`
      SELECT id, name, sort_order, is_default, background_color, background_opacity, emoji FROM account_statuses WHERE id = ${id}::uuid
    `;
    if (!existing) {
      return NextResponse.json(
        { error: "Statut de compte introuvable." },
        { status: 404 }
      );
    }
    const newName = name ?? existing.name;
    const newSortOrder = sortOrder !== undefined ? sortOrder : existing.sort_order;
    const newIsDefault = isDefault !== undefined ? isDefault : existing.is_default;
    const newBackgroundColor = backgroundColorInBody
      ? (body.background_color === null || body.background_color === "" ? null : parseBackgroundColor(body.background_color) ?? existing.background_color)
      : existing.background_color;
    const newBackgroundOpacity = backgroundOpacityInBody
      ? (body.background_opacity === null ? null : parseBackgroundOpacity(body.background_opacity) ?? existing.background_opacity)
      : existing.background_opacity;
    const newEmoji = emojiInBody
      ? (typeof body.emoji === "string" ? body.emoji.trim() || null : body.emoji === null ? null : existing.emoji)
      : existing.emoji;
    if (newIsDefault) {
      await sql`UPDATE account_statuses SET is_default = false WHERE id != ${id}::uuid`;
    }
    const rows = await sql`
      UPDATE account_statuses
      SET name = ${newName}, sort_order = ${newSortOrder}, is_default = ${newIsDefault}, background_color = ${newBackgroundColor}, background_opacity = ${newBackgroundOpacity}, emoji = ${newEmoji}, updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING id, name, sort_order, is_default, background_color, background_opacity, emoji, created_at, updated_at
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Statut de compte introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("PATCH /api/account-statuses/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la mise à jour." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id } = await params;
  try {
    const [deleted] = await sql`
      DELETE FROM account_statuses WHERE id = ${id}::uuid RETURNING id, is_default
    `;
    if (!deleted) {
      return NextResponse.json(
        { error: "Statut de compte introuvable." },
        { status: 404 }
      );
    }
    if (deleted.is_default) {
      const [next] = await sql`
        SELECT id FROM account_statuses ORDER BY sort_order, name LIMIT 1
      `;
      if (next) {
        await sql`UPDATE account_statuses SET is_default = true WHERE id = ${next.id}::uuid`;
      }
    }
    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    console.error("DELETE /api/account-statuses/[id] error:", error);
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("foreign key") || msg.includes("violates")) {
      return NextResponse.json(
        { error: "Impossible de supprimer ce statut : des comptes l'utilisent encore." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Échec de la suppression." },
      { status: 500 }
    );
  }
}
