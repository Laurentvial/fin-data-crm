import { sql } from "@/lib/db";

let hasBankAccountColumnCache: boolean | null = null;
let lastCheckedAtMs = 0;
const FALSE_CACHE_TTL_MS = 30_000;

export async function hasInvoiceBankAccountColumn(): Promise<boolean> {
  const now = Date.now();
  if (hasBankAccountColumnCache === true) {
    return hasBankAccountColumnCache;
  }
  if (
    hasBankAccountColumnCache === false &&
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
        AND column_name = 'bank_account_id'
      LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] : rows;
    hasBankAccountColumnCache = Boolean(row);
    lastCheckedAtMs = now;
  } catch {
    hasBankAccountColumnCache = false;
    lastCheckedAtMs = now;
  }
  return hasBankAccountColumnCache;
}
