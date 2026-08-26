import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { hasInvoiceBankAccountColumn } from "@/lib/invoicing/invoice-bank-account-column";
import { hasInvoicePaymentByCardColumn } from "@/lib/invoicing/invoice-payment-by-card-column";

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
    const hasBankAccountColumn = await hasInvoiceBankAccountColumn();
    const hasPaymentByCardColumn = await hasInvoicePaymentByCardColumn();
    const rows = hasBankAccountColumn
      ? hasPaymentByCardColumn
        ? await sql`
            SELECT
              i.id, i.company_id, i.transaction_id, i.payment_in_installments, i.payment_by_card, i.invoice_number, i.issue_date, i.due_date,
              i.customer_name, i.customer_address, i.customer_vat, i.customer_siret, i.line_items,
              i.subtotal, i.tax_amount, i.total, i.currency, i.status, i.pdf_url,
              i.created_at, i.updated_at,
              c.name AS company_name,
              COALESCE(
                i.bank_account_id,
                t.bank_account_id,
                (
                  SELECT t2.bank_account_id
                  FROM invoice_transactions it
                  JOIN transactions t2 ON t2.id = it.transaction_id
                  WHERE it.invoice_id = i.id
                  ORDER BY t2.created_at DESC
                  LIMIT 1
                )
              ) AS bank_account_id
            FROM invoices i
            JOIN companies c ON c.id = i.company_id
            LEFT JOIN transactions t ON t.id = i.transaction_id
            WHERE i.id = ${id}::uuid
          `
        : await sql`
            SELECT
              i.id, i.company_id, i.transaction_id, i.payment_in_installments, false AS payment_by_card, i.invoice_number, i.issue_date, i.due_date,
              i.customer_name, i.customer_address, i.customer_vat, i.customer_siret, i.line_items,
              i.subtotal, i.tax_amount, i.total, i.currency, i.status, i.pdf_url,
              i.created_at, i.updated_at,
              c.name AS company_name,
              COALESCE(
                i.bank_account_id,
                t.bank_account_id,
                (
                  SELECT t2.bank_account_id
                  FROM invoice_transactions it
                  JOIN transactions t2 ON t2.id = it.transaction_id
                  WHERE it.invoice_id = i.id
                  ORDER BY t2.created_at DESC
                  LIMIT 1
                )
              ) AS bank_account_id
            FROM invoices i
            JOIN companies c ON c.id = i.company_id
            LEFT JOIN transactions t ON t.id = i.transaction_id
            WHERE i.id = ${id}::uuid
          `
      : hasPaymentByCardColumn
        ? await sql`
            SELECT
              i.id, i.company_id, i.transaction_id, i.payment_in_installments, i.payment_by_card, i.invoice_number, i.issue_date, i.due_date,
              i.customer_name, i.customer_address, i.customer_vat, i.customer_siret, i.line_items,
              i.subtotal, i.tax_amount, i.total, i.currency, i.status, i.pdf_url,
              i.created_at, i.updated_at,
              c.name AS company_name,
              COALESCE(
                t.bank_account_id,
                (
                  SELECT t2.bank_account_id
                  FROM invoice_transactions it
                  JOIN transactions t2 ON t2.id = it.transaction_id
                  WHERE it.invoice_id = i.id
                  ORDER BY t2.created_at DESC
                  LIMIT 1
                )
              ) AS bank_account_id
            FROM invoices i
            JOIN companies c ON c.id = i.company_id
            LEFT JOIN transactions t ON t.id = i.transaction_id
            WHERE i.id = ${id}::uuid
          `
        : await sql`
            SELECT
              i.id, i.company_id, i.transaction_id, i.payment_in_installments, false AS payment_by_card, i.invoice_number, i.issue_date, i.due_date,
              i.customer_name, i.customer_address, i.customer_vat, i.customer_siret, i.line_items,
              i.subtotal, i.tax_amount, i.total, i.currency, i.status, i.pdf_url,
              i.created_at, i.updated_at,
              c.name AS company_name,
              COALESCE(
                t.bank_account_id,
                (
                  SELECT t2.bank_account_id
                  FROM invoice_transactions it
                  JOIN transactions t2 ON t2.id = it.transaction_id
                  WHERE it.invoice_id = i.id
                  ORDER BY t2.created_at DESC
                  LIMIT 1
                )
              ) AS bank_account_id
            FROM invoices i
            JOIN companies c ON c.id = i.company_id
            LEFT JOIN transactions t ON t.id = i.transaction_id
            WHERE i.id = ${id}::uuid
          `;
    const row = Array.isArray(rows) ? rows[0] : rows;

    if (!row) {
      return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
    }

    return NextResponse.json({
      id: row.id,
      company_id: row.company_id,
      company_name: row.company_name,
      transaction_id: row.transaction_id,
      bank_account_id: row.bank_account_id ?? null,
      payment_in_installments: Boolean(row.payment_in_installments),
      payment_by_card: Boolean(row.payment_by_card),
      invoice_number: row.invoice_number,
      issue_date: row.issue_date,
      due_date: row.due_date,
      customer_name: row.customer_name,
      customer_address: row.customer_address,
      customer_vat: row.customer_vat,
      customer_siret: row.customer_siret ?? null,
      line_items: row.line_items,
      subtotal: Number(row.subtotal),
      tax_amount: Number(row.tax_amount),
      total: Number(row.total),
      currency: row.currency,
      status: row.status,
      pdf_url: row.pdf_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  } catch (error) {
    console.error("GET /api/invoices/[id] error:", error);
    return NextResponse.json(
      { error: "Échec du chargement" },
      { status: 500 }
    );
  }
}
