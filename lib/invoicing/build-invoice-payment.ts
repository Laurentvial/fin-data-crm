import { PAYMENT_BY_CARD_MENTION } from "./payment-card";
import { PAYMENT_INSTALLMENTS_MENTION } from "./payment-installments";

export interface InvoicePaymentTemplateData {
  iban?: string;
  bic?: string;
  installmentsEnabled?: boolean;
  installmentsMention?: string;
  cardPaymentEnabled?: boolean;
  cardPaymentMention?: string;
}

export function buildInvoicePayment(options: {
  paymentByCard: boolean;
  paymentInInstallments: boolean;
  iban?: string | null;
  bic?: string | null;
}): InvoicePaymentTemplateData | undefined {
  if (options.paymentByCard) {
    return {
      cardPaymentEnabled: true,
      cardPaymentMention: PAYMENT_BY_CARD_MENTION,
    };
  }
  if (!options.iban) return undefined;
  const iban = options.iban.replace(/(.{4})/g, "$1 ").trim();
  return {
    iban,
    bic: options.bic || undefined,
    installmentsEnabled: options.paymentInInstallments,
    installmentsMention: PAYMENT_INSTALLMENTS_MENTION,
  };
}
