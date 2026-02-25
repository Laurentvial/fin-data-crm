import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";

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
    const company_id = typeof body?.company_id === "string" ? body.company_id.trim() : undefined;
    const telegram_chat_id =
      body?.telegram_chat_id !== undefined
        ? (typeof body.telegram_chat_id === "number"
            ? body.telegram_chat_id
            : typeof body.telegram_chat_id === "string"
              ? parseInt(body.telegram_chat_id, 10)
              : undefined)
        : undefined;

    if (!name && company_id === undefined && telegram_chat_id === undefined) {
      return NextResponse.json(
        { error: "Aucune modification fournie." },
        { status: 400 }
      );
    }

    const [existing] = await sql`
      SELECT id, name, company_id, telegram_chat_id FROM bank_accounts WHERE id = ${id}
    `;
    if (!existing) {
      return NextResponse.json(
        { error: "Compte bancaire introuvable." },
        { status: 404 }
      );
    }

    const newName = name ?? existing.name;
    const newCompanyId = company_id ?? existing.company_id;
    const newTelegramChatId =
      telegram_chat_id !== undefined ? telegram_chat_id : existing.telegram_chat_id;

    const rows = await sql`
      UPDATE bank_accounts
      SET
        name = ${newName},
        company_id = ${newCompanyId},
        telegram_chat_id = ${newTelegramChatId},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, company_id, name, telegram_chat_id, created_at, updated_at
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Compte bancaire introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("PATCH /api/bank-accounts/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la mise à jour." },
      { status: 500 }
    );
  }
}
