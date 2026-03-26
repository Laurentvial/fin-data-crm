/** Digits only, 9 (SIREN) or 14 (SIRET). */
export function normalizeSirenOrSiret(raw: string): { kind: "siren"; value: string } | { kind: "siret"; value: string } | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return { kind: "siren", value: digits };
  if (digits.length === 14) return { kind: "siret", value: digits };
  return null;
}

export function frenchVatFromSiren(siren: string): string {
  const padded = siren.padStart(9, "0");
  const n = parseInt(padded, 10);
  if (!Number.isFinite(n)) return "";
  const key = (12 + 3 * (n % 97)) % 97;
  const keyStr = key < 10 ? `0${key}` : String(key);
  return `FR${keyStr}${padded}`;
}
