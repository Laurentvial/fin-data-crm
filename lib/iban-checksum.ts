/** ISO 13616 MOD-97-10 check — works offline when external lookup APIs fail. */
export function isValidIbanChecksum(iban: string): boolean {
  const s = iban.replace(/\s/g, "").toUpperCase();
  if (s.length < 15 || s.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let expanded = "";
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) expanded += ch;
    else if (code >= 65 && code <= 90) expanded += (code - 55).toString();
    else return false;
  }
  let remainder = 0;
  for (let i = 0; i < expanded.length; i++) {
    remainder = (remainder * 10 + (expanded.charCodeAt(i) - 48)) % 97;
  }
  return remainder === 1;
}
