/** Display rate for templates that show a single `invoice.vatRate`. */
export function resolveInvoiceDisplayVatRate(
  lineItems: Array<{ vat_rate: number }>,
  fallback: number
): number {
  if (lineItems.length === 0) return fallback;
  const first = lineItems[0].vat_rate;
  if (lineItems.every((li) => li.vat_rate === first)) return first;
  // Mixed rates: templates only support one label; use the first line rate.
  return first;
}
