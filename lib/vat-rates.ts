/**
 * VAT rates by country (standard + reduced rates).
 * Used to suggest available rates when configuring a societe based on its country.
 * Source: EU VAT rates 2024, Switzerland, Norway, UK.
 */
export interface CountryVatRates {
  countryCode: string;
  /** Standard rate (obligatory in EU, min 15%) */
  standard: number;
  /** Reduced rates (e.g. 5.5%, 10% in France) */
  reduced: number[];
  /** Super-reduced rate (e.g. 2.1% in France) */
  superReduced?: number;
  /** Parking rate (some EU countries) */
  parking?: number;
}

/** VAT rates by country code (ISO 3166-1 alpha-2) */
export const VAT_RATES_BY_COUNTRY: Record<string, CountryVatRates> = {
  AT: { countryCode: "AT", standard: 20, reduced: [10, 13], parking: 13 },
  BE: { countryCode: "BE", standard: 21, reduced: [6, 12], parking: 12 },
  BG: { countryCode: "BG", standard: 20, reduced: [9] },
  HR: { countryCode: "HR", standard: 25, reduced: [5, 13] },
  CY: { countryCode: "CY", standard: 19, reduced: [5, 9] },
  CZ: { countryCode: "CZ", standard: 21, reduced: [12] },
  DK: { countryCode: "DK", standard: 25, reduced: [] },
  EE: { countryCode: "EE", standard: 22, reduced: [9, 5] },
  FI: { countryCode: "FI", standard: 24, reduced: [10, 14] },
  FR: { countryCode: "FR", standard: 20, reduced: [5.5, 10], superReduced: 2.1 },
  DE: { countryCode: "DE", standard: 19, reduced: [7] },
  GR: { countryCode: "GR", standard: 24, reduced: [6, 13] },
  HU: { countryCode: "HU", standard: 27, reduced: [5, 18] },
  IE: { countryCode: "IE", standard: 23, reduced: [9, 13.5], superReduced: 4.8, parking: 13.5 },
  IT: { countryCode: "IT", standard: 22, reduced: [10, 5], superReduced: 4 },
  LV: { countryCode: "LV", standard: 21, reduced: [12, 5] },
  LT: { countryCode: "LT", standard: 21, reduced: [5, 9] },
  LU: { countryCode: "LU", standard: 17, reduced: [8, 14], superReduced: 3, parking: 12 },
  MT: { countryCode: "MT", standard: 18, reduced: [5, 7] },
  NL: { countryCode: "NL", standard: 21, reduced: [9] },
  NO: { countryCode: "NO", standard: 25, reduced: [15, 12] },
  PL: { countryCode: "PL", standard: 23, reduced: [5, 8] },
  PT: { countryCode: "PT", standard: 23, reduced: [6, 13], parking: 13 },
  RO: { countryCode: "RO", standard: 19, reduced: [5, 9] },
  SK: { countryCode: "SK", standard: 20, reduced: [10] },
  SI: { countryCode: "SI", standard: 22, reduced: [9.5, 5] },
  ES: { countryCode: "ES", standard: 21, reduced: [10], superReduced: 4 },
  SE: { countryCode: "SE", standard: 25, reduced: [6, 12] },
  CH: { countryCode: "CH", standard: 8.1, reduced: [2.6, 3.8] },
  GB: { countryCode: "GB", standard: 20, reduced: [5] },
  UK: { countryCode: "UK", standard: 20, reduced: [5] },
  US: { countryCode: "US", standard: 0, reduced: [] },
};

/** Default rates when country is unknown (France) */
const DEFAULT_COUNTRY = "FR";

/**
 * Returns all available VAT rates for a country (standard + reduced + super-reduced + parking),
 * sorted ascending, deduplicated.
 */
export function getVatRatesForCountry(countryCode: string): number[] {
  const code = (countryCode || DEFAULT_COUNTRY).toUpperCase().slice(0, 2);
  const rates = VAT_RATES_BY_COUNTRY[code] ?? VAT_RATES_BY_COUNTRY[DEFAULT_COUNTRY];
  const all: number[] = [
    rates.standard,
    ...rates.reduced,
    ...(rates.superReduced != null ? [rates.superReduced] : []),
    ...(rates.parking != null && !rates.reduced.includes(rates.parking) ? [rates.parking] : []),
  ];
  return [...new Set(all)].sort((a, b) => a - b);
}

/**
 * Returns the default (standard) VAT rate for a country.
 */
export function getDefaultVatRateForCountry(countryCode: string): number {
  const code = (countryCode || DEFAULT_COUNTRY).toUpperCase().slice(0, 2);
  const rates = VAT_RATES_BY_COUNTRY[code] ?? VAT_RATES_BY_COUNTRY[DEFAULT_COUNTRY];
  return rates.standard;
}
