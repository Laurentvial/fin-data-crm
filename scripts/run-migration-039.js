/**
 * Run migration 039 - invoice_transactions junction + backfill.
 * Usage: node scripts/run-migration-039.js
 */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const root = path.resolve(__dirname, "..");
  for (const file of [".env.local", ".env"]) {
    const p = path.join(root, file);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf8");
      for (const line of content.split("\n")) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) {
          const key = m[1].trim();
          const val = m[2].trim().replace(/^["']|["']$/g, "");
          process.env[key] = val;
        }
      }
      return;
    }
  }
}

async function main() {
  loadEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL not set. Add it to .env.local");
    process.exit(1);
  }

  const { neon } = require("@neondatabase/serverless");
  const sql = neon(databaseUrl);

  console.log("Running migration 039 (invoice_transactions)...");

  await sql`
    CREATE TABLE IF NOT EXISTS invoice_transactions (
      invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      created_at timestamp without time zone NOT NULL DEFAULT now(),
      PRIMARY KEY (invoice_id, transaction_id)
    )
  `;
  console.log("  OK: table invoice_transactions");

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_transactions_transaction_id
    ON invoice_transactions (transaction_id)
  `;
  console.log("  OK: unique index on transaction_id");

  await sql`
    CREATE INDEX IF NOT EXISTS ix_invoice_transactions_invoice_id
    ON invoice_transactions (invoice_id)
  `;
  console.log("  OK: index on invoice_id");

  await sql`
    INSERT INTO invoice_transactions (invoice_id, transaction_id)
    SELECT i.id, i.transaction_id
    FROM invoices i
    WHERE NOT EXISTS (
      SELECT 1 FROM invoice_transactions it
      WHERE it.invoice_id = i.id AND it.transaction_id = i.transaction_id
    )
  `;
  console.log("  OK: backfill from invoices.transaction_id");

  console.log("Migration 039 done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
