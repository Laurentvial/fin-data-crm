import { sql } from "@/lib/db";
import type { InvoiceLineItem, InvoiceLineItemInput } from "@/lib/types";
import { getCountryRules } from "./country-rules";
import { htmlToPdfBuffer } from "./html-to-pdf";
import { uploadPdfToCloudinary } from "./cloudinary";
import { renderHandlebarsTemplate } from "./render-template";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_TEMPLATE = readFileSync(
  join(process.cwd(), "lib/invoicing/default-template.html"),
  "utf-8"
);

export interface CreateManualInvoiceInput {
  companyId: string;
  /** Optional bank account used for payment (IBAN/BIC) display in PDF. */
  bankAccountId?: string;
  customerName: string;
  customerAddress?: string;
  customerVat?: string;
  customerSiret?: string;
  issueDate: string; // YYYY-MM-DD
  /** Optional due date (YYYY-MM-DD). */
  dueDate?: string;
  lineItems: InvoiceLineItemInput[];
}

export interface CreateManualInvoiceResult {
  id: string;
  invoiceNumber: string;
  pdfUrl: string;
}

type CompanyRow = {
  id: string;
  name: unknown;
  address: unknown;
  code_postal: unknown;
  ville: unknown;
  siret: unknown;
  directeur: unknown;
  website: unknown;
  country_code: unknown;
  vat_number: unknown;
  vat_rate: unknown;
  vat_rates: unknown;
  invoice_prefix: unknown;
  invoice_next_number: unknown;
  currency: unknown;
  invoice_template_id: unknown;
};

function computeLineItems(
  lineItemsInput: InvoiceLineItemInput[],
  defaultVatRatePct: number
): InvoiceLineItem[] {
  return lineItemsInput.map((li) => {
    const vatRatePct =
      li.vat_rate != null && !Number.isNaN(li.vat_rate) ? li.vat_rate : defaultVatRatePct;
    const vatRate = vatRatePct / 100;
    const amount = Math.round(li.quantity * li.unit_price_ttc * 100) / 100;
    const unitPriceHt =
      vatRate >= 0 ? amount / (1 + vatRate) / li.quantity : amount / li.quantity;
    return {
      description: li.description,
      quantity: li.quantity,
      unit_price: Math.round(unitPriceHt * 100) / 100,
      vat_rate: vatRatePct,
      amount,
    };
  });
}

export async function createManualInvoice(
  input: CreateManualInvoiceInput
): Promise<CreateManualInvoiceResult> {
  const {
    companyId,
    bankAccountId,
    customerName,
    customerAddress,
    customerVat,
    customerSiret,
    issueDate,
    dueDate,
    lineItems: lineItemsInput,
  } = input;

  const dueDateSql =
    typeof dueDate === "string" && dueDate.trim() && /^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())
      ? dueDate.trim()
      : null;

  const companyRows = await sql`
    SELECT
      id, name, address, code_postal, ville, siret, directeur, website,
      country_code, vat_number, vat_rate, vat_rates,
      invoice_prefix, invoice_next_number, currency, invoice_template_id
    FROM companies
    WHERE id = ${companyId}::uuid
    LIMIT 1
  `;
  const company = (Array.isArray(companyRows) ? companyRows[0] : companyRows) as CompanyRow | undefined;
  if (!company?.id) {
    throw new Error("Société introuvable");
  }

  const vatRatesArr = company.vat_rates as number[] | null | undefined;
  const defaultVatRatePct =
    Array.isArray(vatRatesArr) && vatRatesArr.length > 0
      ? vatRatesArr[0]
      : Number(company.vat_rate ?? 20);

  const currency = (company.currency as string) ?? "EUR";
  const countryCode = (company.country_code as string) ?? "FR";

  const lineItems = computeLineItems(lineItemsInput, defaultVatRatePct);

  const total = Math.round(lineItems.reduce((s, li) => s + li.amount, 0) * 100) / 100;
  const subtotal =
    Math.round(
      lineItems.reduce((s, li) => {
        const rate = li.vat_rate / 100;
        return s + li.amount / (1 + rate);
      }, 0) * 100
    ) / 100;
  const taxAmount = Math.round((total - subtotal) * 100) / 100;

  const allLinesZeroVat = lineItems.length > 0 && lineItems.every((li) => li.vat_rate === 0);
  const invoiceVatRate = allLinesZeroVat ? 0 : defaultVatRatePct;

  const invoicePrefix = (company.invoice_prefix as string) ?? "FAC-";
  const year = new Date().getFullYear();

  const invoiceTemplateId = company.invoice_template_id as string | null | undefined;
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

  // Payment info: pick first available IBAN of any account of the company.
  let payment: { iban?: string; bic?: string } | undefined;
  const bankAccountIdNorm =
    typeof bankAccountId === "string" && bankAccountId.trim()
      ? bankAccountId.trim()
      : null;
  const ibanRows = bankAccountIdNorm
    ? await sql`
        SELECT i.iban, i.bic
        FROM bank_accounts ba
        JOIN bank_account_ibans i ON i.bank_account_id = ba.id
        WHERE ba.company_id = ${companyId}::uuid
          AND ba.id = ${bankAccountIdNorm}::uuid
        ORDER BY i.created_at
        LIMIT 1
      `
    : await sql`
        SELECT i.iban, i.bic
        FROM bank_accounts ba
        JOIN bank_account_ibans i ON i.bank_account_id = ba.id
        WHERE ba.company_id = ${companyId}::uuid
        ORDER BY i.created_at
        LIMIT 1
      `;
  const ibanRow = Array.isArray(ibanRows) ? ibanRows[0] : ibanRows;
  if (ibanRow?.iban) {
    const iban = (ibanRow.iban as string).replace(/(.{4})/g, "$1 ").trim();
    payment = { iban, bic: (ibanRow.bic as string) || undefined };
  }

  const nameNorm = customerName.trim().toLowerCase();
  const existingCustomerRows = await sql`
    SELECT id FROM customers
    WHERE company_id = ${companyId}::uuid AND lower(trim(name)) = ${nameNorm}
    LIMIT 1
  `;
  const existingCustomer = Array.isArray(existingCustomerRows) ? existingCustomerRows[0] : existingCustomerRows;
  let customerId: string | null = null;
  if (existingCustomer?.id) {
    customerId = existingCustomer.id as string;
    await sql`
      UPDATE customers SET
        address = COALESCE(${customerAddress ?? null}, address),
        vat_number = COALESCE(${customerVat ?? null}, vat_number),
        siret = COALESCE(${customerSiret ?? null}, siret),
        updated_at = NOW()
      WHERE id = ${customerId}::uuid
    `;
  } else {
    const insertCustomerRows = await sql`
      INSERT INTO customers (company_id, name, address, vat_number, siret)
      VALUES (${companyId}::uuid, ${customerName.trim()}, ${customerAddress ?? null}, ${customerVat ?? null}, ${customerSiret ?? null})
      RETURNING id
    `;
    const insertedCustomer = Array.isArray(insertCustomerRows) ? insertCustomerRows[0] : insertCustomerRows;
    customerId = (insertedCustomer?.id as string) ?? null;
  }

  let invoiceNumber = "";
  let invoiceId = "";
  let pdfBytes: Buffer | null = null;

  const maxAttempts = 12;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
    invoiceNumber = `${invoicePrefix}${year}-${String(seq).padStart(4, "0")}`;

    const templateData = {
      company: {
        name: company.name,
        address: company.address,
        code_postal: company.code_postal,
        ville: company.ville,
        siret: company.siret,
        directeur: company.directeur,
        vat_number: company.vat_number,
        website: (company.website as string) || undefined,
        logo_url: logoUrl,
      },
      customer: {
        name: customerName,
        address: customerAddress ?? "",
        vat: customerVat ?? "",
        siret: customerSiret ?? "",
      },
      invoice: {
        number: invoiceNumber,
        issueDate,
        dueDate: dueDateSql ?? "",
        subtotal,
        taxAmount,
        total,
        currency,
        vatRate: invoiceVatRate,
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
    pdfBytes = await htmlToPdfBuffer(html);

    let insertRows: unknown;
    try {
      insertRows = await sql`
        INSERT INTO invoices (
          company_id, transaction_id, customer_id, invoice_number, issue_date, due_date,
          customer_name, customer_address, customer_vat, customer_siret, line_items,
          subtotal, tax_amount, total, currency, status
        )
        VALUES (
          ${companyId}::uuid, NULL, ${customerId}::uuid, ${invoiceNumber},
          ${issueDate}::date, ${dueDateSql}::date,
          ${customerName}, ${customerAddress ?? null}, ${customerVat ?? null}, ${customerSiret ?? null},
          ${JSON.stringify(lineItems)}::jsonb,
          ${subtotal}, ${taxAmount},
          ${total}, ${currency}, 'issued'
        )
        RETURNING id
      `;
    } catch (err) {
      const pg = err as { code?: string; message?: string; constraint?: string };
      const msg = String(pg?.message ?? err);
      if (
        pg?.code === "23502" &&
        (msg.includes("transaction_id") || msg.includes('"transaction_id"'))
      ) {
        throw new Error(
          "Schéma DB obsolète: `invoices.transaction_id` est encore NOT NULL. " +
            "Appliquez la migration `migrations/045_invoices_transaction_nullable.sql` " +
            "(ex: `npm run migrate:045`)."
        );
      }
      if (
        pg?.code === "23502" &&
        (msg.includes("due_date") || msg.includes('"due_date"'))
      ) {
        throw new Error(
          "Schéma DB obsolète: `invoices.due_date` est encore NOT NULL. " +
            "Appliquez la migration `migrations/046_invoices_due_date_nullable.sql` " +
            "(ex: `npm run migrate:046`)."
        );
      }
      const isInvoiceNumberDup =
        pg?.code === "23505" &&
        (pg.constraint === "invoices_invoice_number_key" ||
          msg.includes("invoices_invoice_number_key") ||
          msg.includes("invoice_number"));
      if (isInvoiceNumberDup && attempt < maxAttempts) {
        continue;
      }
      throw err;
    }

    const inserted = Array.isArray(insertRows) ? insertRows[0] : insertRows;
    invoiceId = (inserted?.id as string) ?? "";
    break;
  }

  if (!invoiceId || !invoiceNumber || !pdfBytes) {
    throw new Error(
      "Impossible d'allouer un numéro de facture unique après plusieurs tentatives " +
        "(conflits sur `invoice_number`). Vérifiez les doublons existants ou les préfixes partagés entre sociétés."
    );
  }

  const pdfUrl = await uploadPdfToCloudinary(pdfBytes, companyId, invoiceId);

  await sql`
    UPDATE invoices SET pdf_url = ${pdfUrl}, updated_at = NOW() WHERE id = ${invoiceId}::uuid
  `;

  return {
    id: invoiceId,
    invoiceNumber,
    pdfUrl,
  };
}

