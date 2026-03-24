/**
 * Non-emoji segment for auto bank account names.
 * Avoids "BANK / BANK / REST" when the company name already starts with the bank label.
 */
export function buildAutoAccountTextPart(
  midPart: string,
  companyName: string,
  bankName: string
): string {
  const m = midPart.trim().toUpperCase();
  const c = companyName.trim();
  const b = bankName.trim().toUpperCase();
  const cu = c.toUpperCase();
  if (!c && !m) return "";
  if (!c) return m;
  if (!m) return cu;
  if (cu === m || cu.startsWith(m + " / ")) return cu;
  if (b && (cu === b || cu.startsWith(b + " / "))) return cu;
  return `${m} / ${cu}`;
}

/** Status emoji only + uppercased bank/company segment (product convention). */
export function buildAutoBankAccountName(
  statusEmoji: string,
  midPart: string,
  companyName: string,
  bankName: string
): string {
  const prefix = statusEmoji.trim().replace(/\s/g, "");
  const text = buildAutoAccountTextPart(midPart, companyName, bankName);
  if (!text) return prefix || "";
  return prefix ? `${prefix} ${text}` : text;
}
