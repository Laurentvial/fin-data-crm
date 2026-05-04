import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "@/lib/db";
import { getCountryRules } from "./country-rules";
import { htmlToPdfBuffer } from "./html-to-pdf";
import { renderHandlebarsTemplate } from "./render-template";
import { uploadPdfToCloudinary } from "./cloudinary";
import type { InvoiceLineItem } from "@/lib/types";

const DEFAULT_TEMPLATE = readFileSync(
  join(process.cwd(), "lib/invoicing/default-template.html"),
  "utf-8"
);

interface RegenerateInvoiceResult {
  id: string;
  invoiceNumber: string;
  pdfUrl: string;
}

type InvoiceRow = {
  id: string;
  company_id: string;
  transaction_id: string | null;
  invoice_number: unknown;
  issue_date: unknown;
  due_date: unknown;
  customer_name: unknown;
  customer_address: unknown;
  customer_vat: unknown;
  line_items: unknown;
  subtotal: unknown;
  tax_amount: unknown;
  total: unknown;
  currency: unknown;
};

type CompanyRow = {
  id: string;
  name: unknown;
  address: unknown;
  siret: unknown;
  directeur: unknown;
  website: unknown;
  country_code: unknown;
  vat_number: unknown;
  vat_rate: unknown;
  vat_rates: unknown;
  invoice_template_id: unknown;
};

function toDateStr(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return "";
}

function normalizeLineItems(raw: unknown): InvoiceLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((li) => {
      const description = typeof li?.description === "string" ? li.description.trim() : "";
      const quantity = Number(li?.quantity);
      const unitPrice = Number(li?.unit_price);
      const vatRate = Number(li?.vat_rate);
      const amount = Number(li?.amount);
      if (!description || quantity <= 0 || Number.isNaN(unitPrice) || Number.isNaN(vatRate) || Number.isNaN(amount)) {
        return null;
      }
      return {
        description,
        quantity,
        unit_price: unitPrice,
        vat_rate: vatRate,
        amount,
      };
    })
    .filter((li): li is InvoiceLineItem => li !== null);
}

export async function regenerateInvoice(invoiceId: string): Promise<RegenerateInvoiceResult> {
  const invoiceRows = await sql`
    SELECT
      id, company_id, transaction_id, invoice_number, issue_date, due_date,
      customer_name, customer_address, customer_vat, line_items,
      subtotal, tax_amount, total, currency
    FROM invoices
    WHERE id = ${invoiceId}::uuid
    LIMIT 1
  `;
  const invoice = (Array.isArray(invoiceRows) ? invoiceRows[0] : invoiceRows) as InvoiceRow | undefined;
  if (!invoice?.id) {
    throw new Error("Facture introuvable");
  }

  const companyRows = await sql`
    SELECT
      id, name, address, siret, directeur, website,
      country_code, vat_number, vat_rate, vat_rates, invoice_template_id
    FROM companies
    WHERE id = ${invoice.company_id}::uuid
    LIMIT 1
  `;
  const company = (Array.isArray(companyRows) ? companyRows[0] : companyRows) as CompanyRow | undefined;
  if (!company?.id) {
    throw new Error("Société introuvable");
  }

  const lineItems = normalizeLineItems(invoice.line_items);
  if (lineItems.length === 0) {
    throw new Error("Impossible de régénérer: lignes de facture invalides");
  }

  const currency = typeof invoice.currency === "string" && invoice.currency ? invoice.currency : "EUR";
  const countryCode = typeof company.country_code === "string" && company.country_code ? company.country_code : "FR";
  const invoiceNumber =
    typeof invoice.invoice_number === "string" && invoice.invoice_number
      ? invoice.invoice_number
      : "";
  const issueDate = toDateStr(invoice.issue_date);
  const dueDate = toDateStr(invoice.due_date);
  if (!invoiceNumber || !issueDate) {
    throw new Error("Facture invalide: numéro ou date manquants");
  }

  const vatRatesArr = company.vat_rates as number[] | null | undefined;
  const defaultVatRatePct =
    Array.isArray(vatRatesArr) && vatRatesArr.length > 0
      ? vatRatesArr[0]
      : Number(company.vat_rate ?? 20);
  const allLinesZeroVat = lineItems.length > 0 && lineItems.every((li) => li.vat_rate === 0);
  const invoiceVatRate = allLinesZeroVat ? 0 : defaultVatRatePct;

  const subtotal = Number(invoice.subtotal);
  const taxAmount = Number(invoice.tax_amount);
  const total = Number(invoice.total);

  const invoiceTemplateId = company.invoice_template_id as string | null | undefined;
  const templateRows = invoiceTemplateId
    ? await sql`
        SELECT template_content
        FROM invoice_templates
        WHERE id = ${invoiceTemplateId}::uuid
        LIMIT 1
      `
    : await sql`
        SELECT template_content
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
    WHERE company_id = ${invoice.company_id}::uuid AND file_type = 'logo'
    LIMIT 1
  `;
  const logoRow = Array.isArray(logoRows) ? logoRows[0] : logoRows;
  if (logoRow?.data_base64) {
    const contentType = (logoRow.content_type as string) || "image/png";
    logoUrl = `data:${contentType};base64,${logoRow.data_base64}`;
  }

  let payment: { iban?: string; bic?: string } | undefined;
  const ibanRows = invoice.transaction_id
    ? await sql`
        SELECT i.iban, i.bic
        FROM transactions t
        JOIN bank_account_ibans i ON i.bank_account_id = t.bank_account_id
        WHERE t.id = ${invoice.transaction_id}::uuid
        ORDER BY i.created_at
        LIMIT 1
      `
    : await sql`
        SELECT i.iban, i.bic
        FROM bank_accounts ba
        JOIN bank_account_ibans i ON i.bank_account_id = ba.id
        WHERE ba.company_id = ${invoice.company_id}::uuid
        ORDER BY i.created_at
        LIMIT 1
      `;
  const ibanRow = Array.isArray(ibanRows) ? ibanRows[0] : ibanRows;
  if (ibanRow?.iban) {
    const iban = (ibanRow.iban as string).replace(/(.{4})/g, "$1 ").trim();
    payment = { iban, bic: (ibanRow.bic as string) || undefined };
  }

  const templateData = {
    company: {
      name: company.name,
      address: company.address,
      siret: company.siret,
      directeur: company.directeur,
      vat_number: company.vat_number,
      website: (company.website as string) || undefined,
      logo_url: logoUrl,
    },
    customer: {
      name: typeof invoice.customer_name === "string" ? invoice.customer_name : "",
      address: typeof invoice.customer_address === "string" ? invoice.customer_address : "",
      vat: typeof invoice.customer_vat === "string" ? invoice.customer_vat : "",
    },
    invoice: {
      number: invoiceNumber,
      issueDate,
      dueDate,
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
  const pdfBytes = await htmlToPdfBuffer(html);
  const pdfUrl = await uploadPdfToCloudinary(pdfBytes, invoice.company_id, invoice.id);

  await sql`
    UPDATE invoices
    SET pdf_url = ${pdfUrl}, updated_at = NOW()
    WHERE id = ${invoice.id}::uuid
  `;

  return {
    id: invoice.id,
    invoiceNumber,
    pdfUrl,
  };
}
