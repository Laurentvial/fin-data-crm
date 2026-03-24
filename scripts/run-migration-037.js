/**
 * Run migration 037 - transaction client = account_types (settings Clients)
 * Usage: node scripts/run-migration-037.js
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
  console.log("Running migration 037...");
  await sql`ALTER TABLE bank_accounts DROP COLUMN IF EXISTS default_customer_id`;
  await sql`ALTER TABLE transactions DROP COLUMN IF EXISTS customer_id`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_account_type_id uuid REFERENCES account_types(id) ON DELETE SET NULL`;
  await sql`CREATE INDEX IF NOT EXISTS ix_transactions_client_account_type_id ON transactions(client_account_type_id)`;
  console.log("Migration 037 done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
