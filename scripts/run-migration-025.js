/**
 * Run migration 025 - add company_email_id and company_phone_id to bank_accounts.
 * Usage: node scripts/run-migration-025.js
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

  console.log("Running migration 025 (add company_email_id and company_phone_id to bank_accounts)...");

  await sql`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS company_email_id uuid REFERENCES company_emails(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS company_phone_id uuid REFERENCES company_phones(id) ON DELETE SET NULL`;

  console.log("Migration done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
