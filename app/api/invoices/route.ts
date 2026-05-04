import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { generateInvoice } from "@/lib/invoicing/generate-invoice";
import { createManualInvoice } from "@/lib/invoicing/create-manual-invoice";

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

function isValidDate(s: string): boolean {
  if (typeof s !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
}

function parseTransactionIds(body: unknown): string[] | null {
  const rawIds = (body as { transaction_ids?: unknown })?.transaction_ids;
  if (Array.isArray(rawIds) && rawIds.length > 0) {
    const ids = [
      ...new Set(
        rawIds
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean)
      ),
    ];
    return ids.length > 0 ? ids : null;
  }
  const single = typeof (body as { transaction_id?: unknown })?.transaction_id === "string"
    ? (body as { transaction_id: string }).transaction_id.trim()
    : "";
  return single ? [single] : null;
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const transactionIds = parseTransactionIds(body);
    const companyId =
      typeof (body as { company_id?: unknown })?.company_id === "string"
        ? ((body as { company_id: string }).company_id.trim() || null)
        : null;
    const bankAccountId =
      typeof (body as { bank_account_id?: unknown })?.bank_account_id === "string"
        ? ((body as { bank_account_id: string }).bank_account_id.trim() || undefined)
        : undefined;
    const customerName = typeof body?.customer_name === "string" ? body.customer_name.trim() : "";
    const customerAddress =
      typeof body?.customer_address === "string" ? body.customer_address.trim() || undefined : undefined;
    const customerVat =
      typeof body?.customer_vat === "string" ? body.customer_vat.trim() || undefined : undefined;
    const issueDate =
      typeof (body as { issue_date?: unknown })?.issue_date === "string"
        ? (body as { issue_date: string }).issue_date.trim()
        : "";
    const dueDate =
      typeof (body as { due_date?: unknown })?.due_date === "string"
        ? (body as { due_date: string }).due_date.trim()
        : "";
    const lineItemsRaw = Array.isArray(body?.line_items) ? body.line_items : [];

    if ((!transactionIds || transactionIds.length === 0) && !companyId) {
      return NextResponse.json(
        { error: "transaction_ids (tableau non vide) / transaction_id, ou company_id est requis" },
        { status: 400 }
      );
    }
    if (!customerName) {
      return NextResponse.json(
        { error: "customer_name est requis" },
        { status: 400 }
      );
    }

    const lineItems: Array<{ description: string; quantity: number; unit_price_ttc: number; vat_rate?: number }> = [];
    for (const item of lineItemsRaw) {
      const desc = typeof item?.description === "string" ? item.description.trim() : "";
      const qty = Number(item?.quantity);
      const unitPrice = Number(item?.unit_price_ttc);
      const vatRateRaw =
        typeof item?.vat_rate === "number" && !Number.isNaN(item.vat_rate)
          ? item.vat_rate
          : typeof item?.vat_rate === "string"
            ? parseFloat(item.vat_rate)
            : undefined;
      const vatRate =
        vatRateRaw != null &&
        !Number.isNaN(vatRateRaw) &&
        vatRateRaw >= 0 &&
        vatRateRaw <= 100
          ? vatRateRaw
          : undefined;
      if (desc && qty > 0 && unitPrice > 0) {
        lineItems.push({
          description: desc,
          quantity: qty,
          unit_price_ttc: unitPrice,
          vat_rate: vatRate,
        });
      }
    }
    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: "Au moins une ligne valide (description, quantité > 0, prix unitaire TTC > 0) est requise" },
        { status: 400 }
      );
    }

    const isManual = !transactionIds || transactionIds.length === 0;
    if (isManual) {
      if (!issueDate || !isValidDate(issueDate)) {
        return NextResponse.json(
          { error: "issue_date est requis (format YYYY-MM-DD)" },
          { status: 400 }
        );
      }
      if (!dueDate || !isValidDate(dueDate)) {
        return NextResponse.json(
          { error: "due_date est requis (format YYYY-MM-DD)" },
          { status: 400 }
        );
      }
      if (new Date(`${dueDate}T00:00:00Z`).getTime() < new Date(`${issueDate}T00:00:00Z`).getTime()) {
        return NextResponse.json(
          { error: "due_date doit être postérieur ou égal à issue_date" },
          { status: 400 }
        );
      }
      if (bankAccountId && companyId) {
        const checkRows = await sql`
          SELECT 1
          FROM bank_accounts
          WHERE id = ${bankAccountId}::uuid AND company_id = ${companyId}::uuid
          LIMIT 1
        `;
        const ok = Array.isArray(checkRows) ? checkRows[0] : checkRows;
        if (!ok) {
          return NextResponse.json(
            { error: "bank_account_id invalide (ne correspond pas à cette société)" },
            { status: 400 }
          );
        }
      }
    }

    const result = isManual
      ? await createManualInvoice({
          companyId: companyId as string,
          bankAccountId,
          customerName,
          customerAddress,
          customerVat,
          issueDate,
          dueDate,
          lineItems,
        })
      : await generateInvoice({
          transactionIds: transactionIds as string[],
          customerName,
          customerAddress,
          customerVat,
          lineItems,
        });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /api/invoices error:", err);
    if (msg.includes("Schéma DB obsolète")) {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    if (msg.includes("Impossible d'allouer un numéro de facture unique")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg.includes("Société introuvable")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes("Transaction introuvable")) {
      return NextResponse.json({ error: "Transaction introuvable" }, { status: 404 });
    }
    if (msg.includes("même société")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes("déjà une facture")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes("Au moins une transaction")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes("total des lignes")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes("Cloudinary")) {
      return NextResponse.json(
        { error: "Erreur lors de l'upload du PDF. Vérifiez la configuration Cloudinary." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: msg || "Échec de la génération de la facture" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("company_id") ?? null;
    const transactionId = searchParams.get("transaction_id") ?? null;
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
    const offset = Number(searchParams.get("offset")) || 0;

    const rows = await sql`
      SELECT
        i.id, i.company_id, i.transaction_id, i.invoice_number, i.issue_date, i.due_date,
        i.customer_name, i.customer_address, i.customer_vat, i.line_items,
        i.subtotal, i.tax_amount, i.total, i.currency, i.status, i.pdf_url,
        i.created_at, i.updated_at,
        c.name AS company_name
      FROM invoices i
      JOIN companies c ON c.id = i.company_id
      WHERE
        (${companyId}::uuid IS NULL OR i.company_id = ${companyId}::uuid)
        AND (
          ${transactionId}::uuid IS NULL
          OR i.transaction_id = ${transactionId}::uuid
          OR EXISTS (
            SELECT 1 FROM invoice_transactions it
            WHERE it.invoice_id = i.id AND it.transaction_id = ${transactionId}::uuid
          )
        )
      ORDER BY i.issue_date DESC, i.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const invoices = (Array.isArray(rows) ? rows : [rows]).map((r) => ({
      id: r.id,
      company_id: r.company_id,
      company_name: r.company_name,
      transaction_id: r.transaction_id,
      invoice_number: r.invoice_number,
      issue_date: r.issue_date,
      due_date: r.due_date,
      customer_name: r.customer_name,
      customer_address: r.customer_address,
      customer_vat: r.customer_vat,
      line_items: r.line_items,
      subtotal: Number(r.subtotal),
      tax_amount: Number(r.tax_amount),
      total: Number(r.total),
      currency: r.currency,
      status: r.status,
      pdf_url: r.pdf_url,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return NextResponse.json(invoices);
  } catch (error) {
    console.error("GET /api/invoices error:", error);
    return NextResponse.json(
      { error: "Échec du chargement des factures" },
      { status: 500 }
    );
  }
}
