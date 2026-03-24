/**
 * Run migration 038 - debit_status on transactions
 * Usage: node scripts/run-migration-038.js
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
  console.log("Running migration 038...");
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS debit_status varchar(32) NULL`;
  await sql`ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_debit_status_check`;
  await sql`
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_debit_status_check CHECK (
        debit_status IS NULL
        OR debit_status IN ('ok', 'a_verifier', 'annulee_bloquee')
      )
  `;
  await sql`CREATE INDEX IF NOT EXISTS ix_transactions_debit_status ON transactions (debit_status)`;
  console.log("Migration 038 done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
