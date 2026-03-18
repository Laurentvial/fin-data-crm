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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { id } = await params;
  try {
    const [row] = await sql`
      SELECT
        ba.id,
        ba.company_id,
        ba.name,
        ba.telegram_chat_id,
        ba.bank_id,
        ba.account_type_id,
        ba.account_status,
        b.name AS bank_name,
        at.name AS account_type_name,
        ba.created_at,
        ba.updated_at,
        c.name AS company_name,
        COALESCE(SUM(CASE WHEN t.type = 'DEBIT' THEN -t.amount ELSE t.amount END), 0)::float AS balance,
        EXISTS(SELECT 1 FROM bank_files bf WHERE bf.bank_id = ba.bank_id AND bf.file_type = 'logo') AS has_logo,
        COALESCE(
          (SELECT json_agg(json_build_object('iban', bai.iban, 'bic', bai.bic) ORDER BY bai.created_at)
           FROM bank_account_ibans bai
           WHERE bai.bank_account_id = ba.id),
          '[]'::json
        ) AS ibans
      FROM bank_accounts ba
      JOIN companies c ON c.id = ba.company_id
      LEFT JOIN banks b ON b.id = ba.bank_id
      LEFT JOIN account_types at ON at.id = ba.account_type_id
      LEFT JOIN transactions t ON t.bank_account_id = ba.id
      WHERE ba.id = ${id}
      GROUP BY ba.id, ba.company_id, ba.name, ba.telegram_chat_id, ba.bank_id, ba.account_type_id, ba.account_status, b.name, at.name, ba.created_at, ba.updated_at, c.name
    `;
    if (!row) {
      return NextResponse.json(
        { error: "Compte bancaire introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("GET /api/bank-accounts/[id] error:", error);
    return NextResponse.json(
      { error: "Échec du chargement." },
      { status: 500 }
    );
  }
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
    const bank_id = body?.bank_id !== undefined
      ? (typeof body.bank_id === "string" ? (body.bank_id.trim() || null) : null)
      : undefined;
    const account_type_id = body?.account_type_id !== undefined
      ? (typeof body.account_type_id === "string" ? (body.account_type_id.trim() || null) : null)
      : undefined;
    const validStatuses = ["Ouvert", "Fermé", "Problème"] as const;
    const account_status = body?.account_status !== undefined
      ? (typeof body.account_status === "string" && validStatuses.includes(body.account_status as (typeof validStatuses)[number])
          ? (body.account_status as (typeof validStatuses)[number])
          : undefined)
      : undefined;
    const telegram_chat_id =
      body?.telegram_chat_id !== undefined
        ? (typeof body.telegram_chat_id === "number"
            ? body.telegram_chat_id
            : typeof body.telegram_chat_id === "string"
              ? parseInt(body.telegram_chat_id, 10)
              : undefined)
        : undefined;
    const ibansRaw = body?.ibans;
    const ibanItems: { iban: string; bic?: string | null }[] | undefined = Array.isArray(ibansRaw)
      ? ibansRaw.flatMap((v: unknown) => {
          if (typeof v === "string") {
            const iban = v.trim().replace(/\s/g, "").toUpperCase();
            return iban.length > 0 ? [{ iban, bic: null }] : [];
          }
          if (v && typeof v === "object" && "iban" in v && typeof (v as { iban: unknown }).iban === "string") {
            const obj = v as { iban: string; bic?: string };
            const iban = obj.iban.trim().replace(/\s/g, "").toUpperCase();
            if (iban.length === 0) return [];
            const bic =
              typeof obj.bic === "string" ? (obj.bic.trim().replace(/\s/g, "").toUpperCase().slice(0, 11) || null) : null;
            return [{ iban, bic }];
          }
          return [];
        })
      : undefined;

    if (!name && company_id === undefined && bank_id === undefined && account_type_id === undefined && account_status === undefined && telegram_chat_id === undefined && ibanItems === undefined) {
      return NextResponse.json(
        { error: "Aucune modification fournie." },
        { status: 400 }
      );
    }

    if (name !== undefined && !name) {
      return NextResponse.json(
        { error: "Le nom du compte ne peut pas être vide." },
        { status: 400 }
      );
    }

    if (bank_id !== undefined && bank_id !== null) {
      const [bank] = await sql`SELECT id FROM banks WHERE id = ${bank_id}::uuid LIMIT 1`;
      if (!bank) {
        return NextResponse.json(
          { error: "Banque introuvable." },
          { status: 404 }
        );
      }
    }

    const [existing] = await sql`
      SELECT id, name, company_id, telegram_chat_id, bank_id, account_type_id, account_status FROM bank_accounts WHERE id = ${id}
    `;
    if (!existing) {
      return NextResponse.json(
        { error: "Compte bancaire introuvable." },
        { status: 404 }
      );
    }

    const newName = name ?? existing.name;
    const newCompanyId = company_id ?? existing.company_id;
    const newBankId = bank_id !== undefined ? bank_id : existing.bank_id;
    const newAccountTypeId = account_type_id !== undefined ? account_type_id : existing.account_type_id;
    const newAccountStatus = account_status !== undefined ? account_status : existing.account_status;
    const newTelegramChatId =
      telegram_chat_id !== undefined ? telegram_chat_id : existing.telegram_chat_id;

    const rows = await sql`
      UPDATE bank_accounts
      SET
        name = ${newName},
        company_id = ${newCompanyId},
        bank_id = ${newBankId},
        account_type_id = ${newAccountTypeId},
        account_status = ${newAccountStatus},
        telegram_chat_id = ${newTelegramChatId},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, company_id, name, telegram_chat_id, bank_id, account_type_id, account_status, created_at, updated_at
    `;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Compte bancaire introuvable." },
        { status: 404 }
      );
    }
    if (ibanItems !== undefined) {
      await sql`DELETE FROM bank_account_ibans WHERE bank_account_id = ${id}`;
      for (const item of ibanItems) {
        await sql`
          INSERT INTO bank_account_ibans (bank_account_id, iban, bic)
          VALUES (${id}, ${item.iban}, ${item.bic ?? null})
        `;
      }
    }
    const [full] = await sql`
      SELECT
        ba.id,
        ba.company_id,
        ba.name,
        ba.telegram_chat_id,
        ba.bank_id,
        ba.account_type_id,
        ba.account_status,
        b.name AS bank_name,
        at.name AS account_type_name,
        ba.created_at,
        ba.updated_at,
        c.name AS company_name,
        COALESCE(
          (SELECT json_agg(json_build_object('iban', bai.iban, 'bic', bai.bic) ORDER BY bai.created_at)
           FROM bank_account_ibans bai
           WHERE bai.bank_account_id = ba.id),
          '[]'::json
        ) AS ibans
      FROM bank_accounts ba
      JOIN companies c ON c.id = ba.company_id
      LEFT JOIN banks b ON b.id = ba.bank_id
      LEFT JOIN account_types at ON at.id = ba.account_type_id
      WHERE ba.id = ${id}
    `;
    return NextResponse.json(full ?? row);
  } catch (error) {
    console.error("PATCH /api/bank-accounts/[id] error:", error);
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
    const [hasTransactions] = await sql`
      SELECT 1 FROM transactions WHERE bank_account_id = ${id} LIMIT 1
    `;
    if (hasTransactions) {
      return NextResponse.json(
        { error: "Impossible de supprimer : ce compte a des transactions associées." },
        { status: 400 }
      );
    }
    const rows = await sql`
      DELETE FROM bank_accounts WHERE id = ${id} RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Compte bancaire introuvable." },
        { status: 404 }
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/bank-accounts/[id] error:", error);
    return NextResponse.json(
      { error: "Échec de la suppression." },
      { status: 500 }
    );
  }
}
