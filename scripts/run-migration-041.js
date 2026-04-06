/**
 * Run migration 041 - drop transaction fingerprint unique constraints (import-friendly).
 * Usage: node scripts/run-migration-041.js
 * Or: npm run migrate:041
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

  console.log("Running migration 041 (transactions: drop fingerprint unique)...");

  await sql`ALTER TABLE transactions DROP CONSTRAINT IF EXISTS uix_bank_account_transaction`;
  await sql`ALTER TABLE transactions DROP CONSTRAINT IF EXISTS uix_company_transaction`;
  await sql`DROP INDEX IF EXISTS uix_bank_account_transaction`;
  await sql`DROP INDEX IF EXISTS uix_company_transaction`;

  console.log("Migration 041 done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
