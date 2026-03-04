import { sql } from "@/lib/db";
import { getCountryRules } from "./country-rules";
import { uploadPdfToCloudinary } from "./cloudinary";
import { htmlToPdfBuffer } from "./html-to-pdf";
import { renderHandlebarsTemplate } from "./render-template";
import type { InvoiceLineItem, InvoiceLineItemInput } from "@/lib/types";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_TEMPLATE = readFileSync(
  join(process.cwd(), "lib/invoicing/default-template.html"),
  "utf-8"
);

export interface GenerateInvoiceInput {
  transactionId: string;
  customerName: string;
  customerAddress?: string;
  customerVat?: string;
  lineItems: InvoiceLineItemInput[];
}

export interface GenerateInvoiceResult {
  id: string;
  invoiceNumber: string;
  pdfUrl: string;
}

export async function generateInvoice(
  input: GenerateInvoiceInput
): Promise<GenerateInvoiceResult> {
  const { transactionId, customerName, customerAddress, customerVat, lineItems: lineItemsInput } = input;

  const txnRows = await sql`
    SELECT t.id, t.bank_account_id, t.transaction_date, t.amount, t.description, t.type,
      ba.company_id, c.name AS company_name, c.address AS company_address, c.siret, c.directeur,
      c.vat_number, c.vat_rate, c.invoice_prefix, c.invoice_next_number, c.currency, c.country_code,
      c.invoice_template_id, c.website AS company_website
    FROM transactions t
    JOIN bank_accounts ba ON ba.id = t.bank_account_id
    JOIN companies c ON c.id = ba.company_id
    WHERE t.id = ${transactionId}::uuid
  `;
  const txn = Array.isArray(txnRows) ? txnRows[0] : txnRows;
  if (!txn) {
    throw new Error("Transaction introuvable");
  }

  const companyId = txn.company_id as string;
  const transactionAmount = Math.abs(Number(txn.amount));
  const vatRatePct = Number(txn.vat_rate ?? 20);
  const vatRate = vatRatePct / 100;
  const currency = (txn.currency as string) ?? "EUR";
  const countryCode = (txn.country_code as string) ?? "FR";

  const lineItems: InvoiceLineItem[] = lineItemsInput.map((li) => {
    const amount = Math.round(li.quantity * li.unit_price_ttc * 100) / 100;
    const unitPriceHt = amount / (1 + vatRate) / li.quantity;
    return {
      description: li.description,
      quantity: li.quantity,
      unit_price: Math.round(unitPriceHt * 100) / 100,
      vat_rate: vatRatePct,
      amount,
    };
  });

  const total = Math.round(lineItems.reduce((s, li) => s + li.amount, 0) * 100) / 100;
  if (Math.abs(total - transactionAmount) >= 0.01) {
    throw new Error("Le total des lignes ne correspond pas au montant de la transaction");
  }

  const subtotal = Math.round(lineItems.reduce((s, li) => s + li.amount / (1 + vatRate), 0) * 100) / 100;
  const taxAmount = Math.round((total - subtotal) * 100) / 100;

  const invoicePrefix = (txn.invoice_prefix as string) ?? "FAC-";
  const nextNumRows = await sql`
    UPDATE companies
    SET invoice_next_number = COALESCE(invoice_next_number, 1) + 1,
        updated_at = NOW()
    WHERE id = ${companyId}::uuid
    RETURNING invoice_next_number
  `;
  const nextNum = (Array.isArray(nextNumRows) ? nextNumRows[0] : nextNumRows)
    ?.invoice_next_number as number;
  const seq = nextNum ?? 1;
  const year = new Date().getFullYear();
  const invoiceNumber = `${invoicePrefix}${year}-${String(seq).padStart(4, "0")}`;

  const transactionDate = txn.transaction_date as string | Date;
  const issueDate =
    typeof transactionDate === "string"
      ? transactionDate.slice(0, 10)
      : new Date(transactionDate).toISOString().slice(0, 10);
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateStr = dueDate.toISOString().slice(0, 10);

  const invoiceTemplateId = txn.invoice_template_id as string | null | undefined;
  const templateRows = invoiceTemplateId
    ? await sql`
        SELECT id, template_content
        FROM invoice_templates
        WHERE id = ${invoiceTemplateId}::uuid
        LIMIT 1
      `
    : await sql`
        SELECT id, template_content
        FROM invoice_templates
        WHERE company_id IS NULL AND country_code = ${countryCode}
        ORDER BY is_default DESC
        LIMIT 1
      `;
  const templateRow = Array.isArray(templateRows) ? templateRows[0] : templateRows;
  const templateContent = templateRow?.template_content ?? DEFAULT_TEMPLATE;

  const countryRules = getCountryRules(countryCode);

  let logoUrl: string | undefined;
  const logoRows = await sql`
    SELECT content_type, data_base64
    FROM company_files
    WHERE company_id = ${companyId}::uuid AND file_type = 'logo'
    LIMIT 1
  `;
  const logoRow = Array.isArray(logoRows) ? logoRows[0] : logoRows;
  if (logoRow?.data_base64) {
    const ct = (logoRow.content_type as string) || "image/png";
    logoUrl = `data:${ct};base64,${logoRow.data_base64}`;
  }

  const bankAccountId = txn.bank_account_id as string;
  let payment: { iban?: string; bic?: string } | undefined;
  const ibanRows = await sql`
    SELECT iban, bic FROM bank_account_ibans
    WHERE bank_account_id = ${bankAccountId}::uuid
    ORDER BY created_at
    LIMIT 1
  `;
  const ibanRow = Array.isArray(ibanRows) ? ibanRows[0] : ibanRows;
  if (ibanRow?.iban) {
    const iban = (ibanRow.iban as string).replace(/(.{4})/g, "$1 ").trim();
    payment = { iban, bic: (ibanRow.bic as string) || undefined };
  }

  const templateData = {
    company: {
      name: txn.company_name,
      address: txn.company_address,
      siret: txn.siret,
      directeur: txn.directeur,
      vat_number: txn.vat_number,
      website: (txn.company_website as string) || undefined,
      logo_url: logoUrl,
    },
    customer: {
      name: customerName,
      address: customerAddress ?? "",
      vat: customerVat ?? "",
    },
    invoice: {
      number: invoiceNumber,
      issueDate,
      dueDate: dueDateStr,
      subtotal,
      taxAmount,
      total,
      currency,
      vatRate: vatRatePct,
      isEur: currency === "EUR",
    },
    lineItems,
    payment,
    countryRules: {
      requiredMentions: countryRules.requiredMentions,
      vatLabel: countryRules.vatLabel,
    },
  };

  const html = renderHandlebarsTemplate(templateContent, templateData);
  const pdfBuffer = await htmlToPdfBuffer(html);

  const insertRows = await sql`
    INSERT INTO invoices (
      company_id, transaction_id, invoice_number, issue_date, due_date,
      customer_name, customer_address, customer_vat, line_items,
      subtotal, tax_amount, total, currency, status
    )
    VALUES (
      ${companyId}::uuid, ${transactionId}::uuid, ${invoiceNumber},
      ${issueDate}::date, ${dueDateStr}::date,
      ${customerName}, ${customerAddress ?? null}, ${customerVat ?? null},
      ${JSON.stringify(lineItems)}::jsonb,
      ${subtotal}, ${taxAmount},
      ${total}, ${currency}, 'issued'
    )
    RETURNING id
  `;
  const inserted = Array.isArray(insertRows) ? insertRows[0] : insertRows;
  const invoiceId = (inserted?.id as string) ?? "";

  const pdfUrl = await uploadPdfToCloudinary(pdfBuffer, companyId, invoiceId);

  await sql`
    UPDATE invoices SET pdf_url = ${pdfUrl}, updated_at = NOW() WHERE id = ${invoiceId}::uuid
  `;

  return {
    id: invoiceId,
    invoiceNumber,
    pdfUrl,
  };
}
