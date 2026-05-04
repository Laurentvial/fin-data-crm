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
  /** One or more transactions covered by this invoice (same company). */
  transactionIds: string[];
  customerName: string;
  customerAddress?: string;
  customerVat?: string;
  customerSiret?: string;
  lineItems: InvoiceLineItemInput[];
}

export interface GenerateInvoiceResult {
  id: string;
  invoiceNumber: string;
  pdfUrl: string;
}

type TxnRow = {
  id: string;
  bank_account_id: string;
  transaction_date: string | Date;
  amount: unknown;
  description: unknown;
  type: unknown;
  company_id: string;
  company_name: unknown;
  company_address: unknown;
  company_code_postal: unknown;
  company_ville: unknown;
  siret: unknown;
  directeur: unknown;
  vat_number: unknown;
  vat_rate: unknown;
  vat_rates: unknown;
  invoice_prefix: unknown;
  invoice_next_number: unknown;
  currency: unknown;
  country_code: unknown;
  invoice_template_id: unknown;
  company_website: unknown;
};

function toDateStr(d: string | Date): string {
  return typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
}

/** Latest transaction_date, then lexicographically greatest id (stable anchor). */
function pickAnchorTxn(rows: TxnRow[]): TxnRow {
  return [...rows].sort((a, b) => {
    const da = toDateStr(a.transaction_date);
    const db = toDateStr(b.transaction_date);
    if (da !== db) return db.localeCompare(da);
    return String(b.id).localeCompare(String(a.id));
  })[0];
}

export async function generateInvoice(
  input: GenerateInvoiceInput
): Promise<GenerateInvoiceResult> {
  const { customerName, customerAddress, customerVat, customerSiret, lineItems: lineItemsInput } =
    input;

  const transactionIds = [
    ...new Set(
      input.transactionIds.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean)
    ),
  ];
  if (transactionIds.length === 0) {
    throw new Error("Au moins une transaction est requise");
  }

  const txnRows = await sql`
    SELECT t.id, t.bank_account_id, t.transaction_date, t.amount, t.description, t.type,
      ba.company_id, c.name AS company_name, c.address AS company_address,
      c.code_postal AS company_code_postal, c.ville AS company_ville, c.siret, c.directeur,
      c.vat_number, c.vat_rate, c.vat_rates, c.invoice_prefix, c.invoice_next_number, c.currency, c.country_code,
      c.invoice_template_id, c.website AS company_website
    FROM transactions t
    JOIN bank_accounts ba ON ba.id = t.bank_account_id
    JOIN companies c ON c.id = ba.company_id
    WHERE t.id = ANY(${transactionIds}::uuid[])
  `;
  const rowList = (Array.isArray(txnRows) ? txnRows : txnRows != null ? [txnRows] : []) as TxnRow[];
  if (rowList.length !== transactionIds.length) {
    throw new Error("Transaction introuvable");
  }

  const companyId = rowList[0].company_id as string;
  if (!rowList.every((r) => r.company_id === companyId)) {
    throw new Error("Toutes les transactions doivent appartenir à la même société");
  }

  const alreadyLinked = await sql`
    SELECT transaction_id::text AS transaction_id FROM (
      SELECT transaction_id FROM invoice_transactions
      WHERE transaction_id = ANY(${transactionIds}::uuid[])
      UNION
      SELECT transaction_id FROM invoices
      WHERE transaction_id = ANY(${transactionIds}::uuid[])
    ) sub
  `;
  const linkedList = Array.isArray(alreadyLinked) ? alreadyLinked : alreadyLinked != null ? [alreadyLinked] : [];
  if (linkedList.length > 0) {
    throw new Error("Une ou plusieurs transactions ont déjà une facture");
  }

  const expectedTotal =
    Math.round(
      rowList.reduce((s, r) => s + Math.abs(Number(r.amount)), 0) * 100
    ) / 100;

  const txn = pickAnchorTxn(rowList);
  const issueDate = toDateStr(txn.transaction_date);

  const vatRatesArr = txn.vat_rates as number[] | null | undefined;
  const defaultVatRatePct =
    Array.isArray(vatRatesArr) && vatRatesArr.length > 0
      ? vatRatesArr[0]
      : Number(txn.vat_rate ?? 20);
  const currency = (txn.currency as string) ?? "EUR";
  const countryCode = (txn.country_code as string) ?? "FR";

  const lineItems: InvoiceLineItem[] = lineItemsInput.map((li) => {
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

  const total = Math.round(lineItems.reduce((s, li) => s + li.amount, 0) * 100) / 100;
  if (Math.abs(total - expectedTotal) >= 0.01) {
    throw new Error(
      transactionIds.length > 1
        ? "Le total des lignes doit être égal à la somme des montants des transactions sélectionnées"
        : "Le total des lignes ne correspond pas au montant de la transaction"
    );
  }

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

  const invoicePrefix = (txn.invoice_prefix as string) ?? "FAC-";
  const year = new Date().getFullYear();

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

  const anchorTransactionId = txn.id as string;

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
        name: txn.company_name,
        address: txn.company_address,
        code_postal: txn.company_code_postal,
        ville: txn.company_ville,
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
        siret: customerSiret ?? "",
      },
      invoice: {
        number: invoiceNumber,
        issueDate,
        dueDate: dueDateStr,
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
          ${companyId}::uuid, ${anchorTransactionId}::uuid, ${customerId}::uuid, ${invoiceNumber},
          ${issueDate}::date, ${dueDateStr}::date,
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

  await sql`
    INSERT INTO invoice_transactions (invoice_id, transaction_id)
    SELECT ${invoiceId}::uuid, u.tid::uuid
    FROM unnest(${transactionIds}::uuid[]) AS u(tid)
  `;

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
