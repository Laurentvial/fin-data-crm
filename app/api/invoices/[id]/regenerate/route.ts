import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { canMutate } from "@/lib/auth/permissions";
import { regenerateInvoice } from "@/lib/invoicing/regenerate-invoice";
import type { InvoiceLineItemInput } from "@/lib/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const hasCustomerAddressField = Object.prototype.hasOwnProperty.call(body, "customer_address");
    const hasCustomerVatField = Object.prototype.hasOwnProperty.call(body, "customer_vat");
    const hasCustomerSiretField = Object.prototype.hasOwnProperty.call(body, "customer_siret");
    const hasInvoiceNumberField = Object.prototype.hasOwnProperty.call(body, "invoice_number");
    const hasDueDateField = Object.prototype.hasOwnProperty.call(body, "due_date");
    const hasBankAccountIdField = Object.prototype.hasOwnProperty.call(body, "bank_account_id");
    const customerName =
      typeof body.customer_name === "string" ? body.customer_name.trim() || undefined : undefined;
    const customerAddress = hasCustomerAddressField
      ? typeof body.customer_address === "string"
        ? body.customer_address.trim()
        : body.customer_address === null
          ? ""
          : undefined
      : undefined;
    const customerVat = hasCustomerVatField
      ? typeof body.customer_vat === "string"
        ? body.customer_vat.trim()
        : body.customer_vat === null
          ? ""
          : undefined
      : undefined;
    const customerSiret = hasCustomerSiretField
      ? typeof body.customer_siret === "string"
        ? body.customer_siret.trim()
        : body.customer_siret === null
          ? ""
          : undefined
      : undefined;
    const issueDate =
      typeof body.issue_date === "string" ? body.issue_date.trim() || undefined : undefined;
    const invoiceNumber = hasInvoiceNumberField
      ? typeof body.invoice_number === "string"
        ? body.invoice_number.trim() || undefined
        : undefined
      : undefined;
    const dueDate = hasDueDateField
      ? typeof body.due_date === "string"
        ? body.due_date.trim()
        : body.due_date === null
          ? ""
          : undefined
      : undefined;
    const bankAccountId = hasBankAccountIdField
      ? typeof body.bank_account_id === "string"
        ? body.bank_account_id.trim() || undefined
        : body.bank_account_id === null
          ? ""
          : undefined
      : undefined;
    const lineItems =
      Array.isArray(body.line_items) ? (body.line_items as InvoiceLineItemInput[]) : undefined;

    const result = await regenerateInvoice(id, {
      customerName,
      customerAddress,
      customerVat,
      customerSiret,
      invoiceNumber,
      issueDate,
      dueDate,
      bankAccountId,
      lineItems,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("POST /api/invoices/[id]/regenerate error:", error);
    if (message.includes("Facture introuvable")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("Société introuvable")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("Cloudinary")) {
      return NextResponse.json(
        { error: "Erreur lors de l'upload du PDF. Vérifiez la configuration Cloudinary." },
        { status: 500 }
      );
    }
    if (message.includes("Ce numéro de facture existe déjà")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes("bank_account_id invalide")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: message || "Échec de la régénération de la facture" },
      { status: 500 }
    );
  }
}
