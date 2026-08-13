export interface CountryInvoiceRules {
  countryCode: string;
  vatLabel: string;
  defaultVatRate: number;
  requiredMentions: string[];
  invoiceNumberFormat: string;
  dateFormat: string;
  currency: string;
}

export const COUNTRY_INVOICE_RULES: Record<string, CountryInvoiceRules> = {
  FR: {
    countryCode: "FR",
    vatLabel: "TVA",
    defaultVatRate: 20,
    requiredMentions: [
      "Mentions légales : conformément à l'article L.123-1 du Code de commerce, SIRET obligatoire.",
    ],
    invoiceNumberFormat: "FAC-YYYY-NNNN",
    dateFormat: "DD/MM/YYYY",
    currency: "EUR",
  },
  BE: {
    countryCode: "BE",
    vatLabel: "TVA",
    defaultVatRate: 21,
    requiredMentions: [
      "Numéro TVA belge obligatoire. BCE (Banque-Carrefour des Entreprises) applicable.",
    ],
    invoiceNumberFormat: "FAC-YYYY-NNNN",
    dateFormat: "DD/MM/YYYY",
    currency: "EUR",
  },
  CO: {
    countryCode: "CO",
    vatLabel: "IVA",
    defaultVatRate: 19,
    requiredMentions: [
      "NIT obligatoire selon la réglementation colombienne. IVA applicable. Devise COP.",
    ],
    invoiceNumberFormat: "FAC-YYYY-NNNN",
    dateFormat: "DD/MM/YYYY",
    currency: "COP",
  },
  CH: {
    countryCode: "CH",
    vatLabel: "TVA",
    defaultVatRate: 8.1,
    requiredMentions: [
      "Pas de TVA si chiffre d'affaires inférieur au seuil. Devise CHF.",
    ],
    invoiceNumberFormat: "FAC-YYYY-NNNN",
    dateFormat: "DD.MM.YYYY",
    currency: "CHF",
  },
  PT: {
    countryCode: "PT",
    vatLabel: "IVA",
    defaultVatRate: 23,
    requiredMentions: [
      "NIF (Numéro d'Identification Fiscale) obligatoire. IVA applicable.",
    ],
    invoiceNumberFormat: "FAC-YYYY-NNNN",
    dateFormat: "DD/MM/YYYY",
    currency: "EUR",
  },
  ES: {
    countryCode: "ES",
    vatLabel: "IVA",
    defaultVatRate: 21,
    requiredMentions: [
      "CIF/NIF obligatoire. IVA applicable selon la réglementation espagnole.",
    ],
    invoiceNumberFormat: "FAC-YYYY-NNNN",
    dateFormat: "DD/MM/YYYY",
    currency: "EUR",
  },
};

export function getCountryRules(countryCode: string): CountryInvoiceRules {
  const code = countryCode.toUpperCase().slice(0, 2);
  return COUNTRY_INVOICE_RULES[code] ?? COUNTRY_INVOICE_RULES.FR;
}
