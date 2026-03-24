/**
 * Run migration 036 - bank_accounts.default_customer_id, transactions.customer_id
 * Usage: node scripts/run-migration-036.js
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
    console.error("DATABASE_URL not set.");
    process.exit(1);
  }
  const { neon } = require("@neondatabase/serverless");
  const sql = neon(databaseUrl);
  console.log("Running migration 036...");
  await sql`
    ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS default_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL
  `;
  await sql`
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL
  `;
  await sql`CREATE INDEX IF NOT EXISTS ix_transactions_customer_id ON transactions(customer_id)`;
  console.log("Migration 036 done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
