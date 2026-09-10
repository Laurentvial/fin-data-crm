import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "@/lib/db";
import { getCountryRules } from "./country-rules";
import { htmlToPdfBuffer } from "./html-to-pdf";
import { renderHandlebarsTemplate } from "./render-template";
import { uploadPdfToCloudinary } from "./cloudinary";
import type { InvoiceLineItem, InvoiceLineItemInput } from "@/lib/types";
import { hasInvoiceBankAccountColumn } from "./invoice-bank-account-column";
import { hasInvoicePaymentByCardColumn } from "./invoice-payment-by-card-column";
import { buildInvoicePayment } from "./build-invoice-payment";
import { resolveInvoiceDisplayVatRate } from "./resolve-invoice-vat-rate";
import { ensureCommentairesInTemplate } from "./ensure-commentaires-in-template";

const DEFAULT_TEMPLATE = readFileSync(
  join(process.cwd(), "lib/invoicing/default-template.html"),
  "utf-8"
);

interface RegenerateInvoiceResult {
  id: string;
  invoiceNumber: string;
  pdfUrl: string;
}

interface RegenerateInvoiceInput {
  invoiceNumber?: string;
  customerName?: string;
  customerAddress?: string;
  customerVat?: string;
  customerSiret?: string;
  paymentInInstallments?: boolean;
  paymentByCard?: boolean;
  issueDate?: string;
  dueDate?: string;
  bankAccountId?: string;
  commentaires?: string;
  lineItems?: InvoiceLineItemInput[];
}

type InvoiceRow = {
  id: string;
  company_id: string;
  transaction_id: string | null;
  bank_account_id: string | null;
  payment_in_installments: boolean | null;
  payment_by_card: boolean | null;
  invoice_number: unknown;
  issue_date: unknown;
  due_date: unknown;
  customer_name: unknown;
  customer_address: unknown;
  customer_vat: unknown;
  customer_siret: unknown;
  commentaires: unknown;
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
  code_postal: unknown;
  ville: unknown;
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

function computeTotals(lineItems: InvoiceLineItem[]): { subtotal: number; taxAmount: number; total: number } {
  const total = Math.round(lineItems.reduce((s, li) => s + li.amount, 0) * 100) / 100;
  const subtotal =
    Math.round(
      lineItems.reduce((s, li) => {
        const rate = li.vat_rate / 100;
        return s + li.amount / (1 + rate);
      }, 0) * 100
    ) / 100;
  const taxAmount = Math.round((total - subtotal) * 100) / 100;
  return { subtotal, taxAmount, total };
}

export async function regenerateInvoice(
  invoiceId: string,
  input: RegenerateInvoiceInput = {}
): Promise<RegenerateInvoiceResult> {
  const canPersistInvoiceBankAccount = await hasInvoiceBankAccountColumn();
  const canPersistPaymentByCard = await hasInvoicePaymentByCardColumn();
  const invoiceRowsReal =
    canPersistInvoiceBankAccount && canPersistPaymentByCard
      ? await sql`
          SELECT
            id, company_id, transaction_id, bank_account_id, payment_in_installments, payment_by_card, invoice_number, issue_date, due_date,
            customer_name, customer_address, customer_vat, customer_siret, commentaires, line_items,
            subtotal, tax_amount, total, currency
          FROM invoices
          WHERE id = ${invoiceId}::uuid
          LIMIT 1
        `
      : canPersistInvoiceBankAccount
        ? await sql`
            SELECT
              id, company_id, transaction_id, bank_account_id, payment_in_installments, false AS payment_by_card, invoice_number, issue_date, due_date,
              customer_name, customer_address, customer_vat, customer_siret, commentaires, line_items,
              subtotal, tax_amount, total, currency
            FROM invoices
            WHERE id = ${invoiceId}::uuid
            LIMIT 1
          `
        : canPersistPaymentByCard
          ? await sql`
              SELECT
                id, company_id, transaction_id, NULL::uuid AS bank_account_id, payment_in_installments, payment_by_card, invoice_number, issue_date, due_date,
                customer_name, customer_address, customer_vat, customer_siret, commentaires, line_items,
                subtotal, tax_amount, total, currency
              FROM invoices
              WHERE id = ${invoiceId}::uuid
              LIMIT 1
            `
          : await sql`
              SELECT
                id, company_id, transaction_id, NULL::uuid AS bank_account_id, payment_in_installments, false AS payment_by_card, invoice_number, issue_date, due_date,
                customer_name, customer_address, customer_vat, customer_siret, commentaires, line_items,
                subtotal, tax_amount, total, currency
              FROM invoices
              WHERE id = ${invoiceId}::uuid
              LIMIT 1
            `;
  const invoice = (Array.isArray(invoiceRowsReal) ? invoiceRowsReal[0] : invoiceRowsReal) as
    | InvoiceRow
    | undefined;
  if (!invoice?.id) {
    throw new Error("Facture introuvable");
  }

  const companyRows = await sql`
    SELECT
      id, name, address, code_postal, ville, siret, directeur, website,
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
  const currentInvoiceNumber =
    typeof invoice.invoice_number === "string" && invoice.invoice_number
      ? invoice.invoice_number
      : "";
  const invoiceNumber =
    input.invoiceNumber !== undefined
      ? input.invoiceNumber.trim()
      : currentInvoiceNumber;

  const issueDate = input.issueDate?.trim() || toDateStr(invoice.issue_date);
  const dueDate =
    input.dueDate === undefined ? toDateStr(invoice.due_date) : input.dueDate.trim() || "";
  if (!invoiceNumber || !issueDate) {
    throw new Error("Facture invalide: numéro ou date manquants");
  }
  if (invoiceNumber !== currentInvoiceNumber) {
    const dupRows = await sql`
      SELECT id
      FROM invoices
      WHERE invoice_number = ${invoiceNumber}
        AND id <> ${invoice.id}::uuid
      LIMIT 1
    `;
    const dup = Array.isArray(dupRows) ? dupRows[0] : dupRows;
    if (dup?.id) {
      throw new Error("Ce numéro de facture existe déjà");
    }
  }
  if (new Date(`${issueDate}T00:00:00Z`).toString() === "Invalid Date") {
    throw new Error("Date d'émission invalide");
  }
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new Error("Date d'échéance invalide");
  }
  if (
    dueDate &&
    new Date(`${dueDate}T00:00:00Z`).getTime() < new Date(`${issueDate}T00:00:00Z`).getTime()
  ) {
    throw new Error("La date d'échéance doit être postérieure ou égale à la date d'émission");
  }

  const vatRatesArr = company.vat_rates as number[] | null | undefined;
  const defaultVatRatePct =
    Array.isArray(vatRatesArr) && vatRatesArr.length > 0
      ? vatRatesArr[0]
      : Number(company.vat_rate ?? 20);

  const customerName =
    input.customerName?.trim() ||
    (typeof invoice.customer_name === "string" ? invoice.customer_name.trim() : "");
  if (!customerName) {
    throw new Error("Nom du client requis");
  }
  const customerAddress =
    input.customerAddress !== undefined
      ? input.customerAddress.trim()
      : typeof invoice.customer_address === "string"
        ? invoice.customer_address
        : "";
  const customerVat =
    input.customerVat !== undefined
      ? input.customerVat.trim()
      : typeof invoice.customer_vat === "string"
        ? invoice.customer_vat
        : "";
  const customerSiret =
    input.customerSiret !== undefined
      ? input.customerSiret.trim()
      : typeof invoice.customer_siret === "string"
        ? invoice.customer_siret
        : "";
  const commentaires =
    input.commentaires !== undefined
      ? input.commentaires.trim()
      : typeof invoice.commentaires === "string"
        ? invoice.commentaires
        : "";
  const paymentInInstallments =
    typeof input.paymentInInstallments === "boolean"
      ? input.paymentInInstallments
      : Boolean(invoice.payment_in_installments);
  const paymentByCard =
    typeof input.paymentByCard === "boolean"
      ? input.paymentByCard
      : Boolean(invoice.payment_by_card);

  const editedLineItemsInput = Array.isArray(input.lineItems)
    ? input.lineItems
        .filter((li) => li && typeof li.description === "string")
        .map((li) => ({
          description: li.description.trim(),
          quantity: Number(li.quantity),
          unit_price_ttc: Number(li.unit_price_ttc),
          vat_rate: li.vat_rate != null ? Number(li.vat_rate) : undefined,
        }))
        .filter(
          (li) =>
            li.description &&
            li.quantity > 0 &&
            li.unit_price_ttc > 0 &&
            !Number.isNaN(li.unit_price_ttc)
        )
    : null;

  const lineItemsToUse =
    editedLineItemsInput != null
      ? computeLineItems(editedLineItemsInput, defaultVatRatePct)
      : lineItems;
  if (lineItemsToUse.length === 0) {
    throw new Error("Impossible de régénérer: lignes de facture invalides");
  }

  const invoiceVatRate = resolveInvoiceDisplayVatRate(lineItemsToUse, defaultVatRatePct);
  const { subtotal, taxAmount, total } = computeTotals(lineItemsToUse);

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
  const templateContent = ensureCommentairesInTemplate(
    templateRow?.template_content ?? DEFAULT_TEMPLATE
  );
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

  const currentBankAccountId =
    typeof invoice.bank_account_id === "string" && invoice.bank_account_id.trim()
      ? invoice.bank_account_id.trim()
      : null;
  const bankAccountIdNorm =
    typeof input.bankAccountId === "string" && input.bankAccountId.trim()
      ? input.bankAccountId.trim()
      : null;
  if (bankAccountIdNorm) {
    const bankAccountRows = await sql`
      SELECT 1
      FROM bank_accounts
      WHERE id = ${bankAccountIdNorm}::uuid
        AND company_id = ${invoice.company_id}::uuid
      LIMIT 1
    `;
    const bankAccount = Array.isArray(bankAccountRows) ? bankAccountRows[0] : bankAccountRows;
    if (!bankAccount) {
      throw new Error("bank_account_id invalide (ne correspond pas à cette société)");
    }
  }
  const bankAccountIdToUse = bankAccountIdNorm ?? currentBankAccountId;
  const ibanRows = bankAccountIdToUse
    ? await sql`
        SELECT i.iban, i.bic
        FROM bank_accounts ba
        JOIN bank_account_ibans i ON i.bank_account_id = ba.id
        WHERE ba.company_id = ${invoice.company_id}::uuid
          AND ba.id = ${bankAccountIdToUse}::uuid
        ORDER BY i.created_at
        LIMIT 1
      `
    : invoice.transaction_id
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
  const payment = buildInvoicePayment({
    paymentByCard,
    paymentInInstallments,
    iban: ibanRow?.iban as string | undefined,
    bic: ibanRow?.bic as string | undefined,
  });

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
      address: customerAddress,
      vat: customerVat,
      siret: customerSiret,
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
      commentaires: commentaires ?? "",
    },
    lineItems: lineItemsToUse,
    payment,
    countryRules: {
      requiredMentions: countryRules.requiredMentions,
      vatLabel: countryRules.vatLabel,
    },
  };

  const html = renderHandlebarsTemplate(templateContent, templateData);
  const pdfBytes = await htmlToPdfBuffer(html);
  const pdfUrl = await uploadPdfToCloudinary(pdfBytes, invoice.company_id, invoice.id);

  if (canPersistInvoiceBankAccount) {
    if (canPersistPaymentByCard) {
      await sql`
        UPDATE invoices
        SET
          issue_date = ${issueDate}::date,
          due_date = ${dueDate || null}::date,
          invoice_number = ${invoiceNumber},
          customer_name = ${customerName},
          customer_address = ${customerAddress || null},
          customer_vat = ${customerVat || null},
          customer_siret = ${customerSiret || null},
          commentaires = ${commentaires || null},
          payment_in_installments = ${paymentInInstallments},
          payment_by_card = ${paymentByCard},
          bank_account_id = ${bankAccountIdToUse}::uuid,
          line_items = ${JSON.stringify(lineItemsToUse)}::jsonb,
          subtotal = ${subtotal},
          tax_amount = ${taxAmount},
          total = ${total},
          pdf_url = ${pdfUrl},
          updated_at = NOW()
        WHERE id = ${invoice.id}::uuid
      `;
    } else {
      await sql`
        UPDATE invoices
        SET
          issue_date = ${issueDate}::date,
          due_date = ${dueDate || null}::date,
          invoice_number = ${invoiceNumber},
          customer_name = ${customerName},
          customer_address = ${customerAddress || null},
          customer_vat = ${customerVat || null},
          customer_siret = ${customerSiret || null},
          commentaires = ${commentaires || null},
          payment_in_installments = ${paymentInInstallments},
          bank_account_id = ${bankAccountIdToUse}::uuid,
          line_items = ${JSON.stringify(lineItemsToUse)}::jsonb,
          subtotal = ${subtotal},
          tax_amount = ${taxAmount},
          total = ${total},
          pdf_url = ${pdfUrl},
          updated_at = NOW()
        WHERE id = ${invoice.id}::uuid
      `;
    }
  } else if (canPersistPaymentByCard) {
    await sql`
      UPDATE invoices
      SET
        issue_date = ${issueDate}::date,
        due_date = ${dueDate || null}::date,
        invoice_number = ${invoiceNumber},
        customer_name = ${customerName},
        customer_address = ${customerAddress || null},
        customer_vat = ${customerVat || null},
        customer_siret = ${customerSiret || null},
        commentaires = ${commentaires || null},
        payment_in_installments = ${paymentInInstallments},
        payment_by_card = ${paymentByCard},
        line_items = ${JSON.stringify(lineItemsToUse)}::jsonb,
        subtotal = ${subtotal},
        tax_amount = ${taxAmount},
        total = ${total},
        pdf_url = ${pdfUrl},
        updated_at = NOW()
      WHERE id = ${invoice.id}::uuid
    `;
  } else {
    await sql`
      UPDATE invoices
      SET
        issue_date = ${issueDate}::date,
        due_date = ${dueDate || null}::date,
        invoice_number = ${invoiceNumber},
        customer_name = ${customerName},
        customer_address = ${customerAddress || null},
        customer_vat = ${customerVat || null},
        customer_siret = ${customerSiret || null},
        commentaires = ${commentaires || null},
        payment_in_installments = ${paymentInInstallments},
        line_items = ${JSON.stringify(lineItemsToUse)}::jsonb,
        subtotal = ${subtotal},
        tax_amount = ${taxAmount},
        total = ${total},
        pdf_url = ${pdfUrl},
        updated_at = NOW()
      WHERE id = ${invoice.id}::uuid
    `;
  }

  return {
    id: invoice.id,
    invoiceNumber,
    pdfUrl,
  };
}
