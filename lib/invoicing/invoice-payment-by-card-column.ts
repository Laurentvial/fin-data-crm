import { sql } from "@/lib/db";

let hasPaymentByCardColumnCache: boolean | null = null;
let lastCheckedAtMs = 0;
const FALSE_CACHE_TTL_MS = 30_000;

export async function hasInvoicePaymentByCardColumn(): Promise<boolean> {
  const now = Date.now();
  if (hasPaymentByCardColumnCache === true) {
    return hasPaymentByCardColumnCache;
  }
  if (
    hasPaymentByCardColumnCache === false &&
    now - lastCheckedAtMs < FALSE_CACHE_TTL_MS
  ) {
    return false;
  }
  try {
    const rows = await sql`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'invoices'
        AND column_name = 'payment_by_card'
      LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] : rows;
    hasPaymentByCardColumnCache = Boolean(row);
    lastCheckedAtMs = now;
  } catch {
    hasPaymentByCardColumnCache = false;
    lastCheckedAtMs = now;
  }
  return hasPaymentByCardColumnCache;
}
