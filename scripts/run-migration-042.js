/**
 * Run migration 042 — telegram_chat_id nullable (CRM-only bank accounts).
 * Usage: node scripts/run-migration-042.js
 * Or: npm run migrate:042
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

  console.log("Running migration 042 (bank_accounts.telegram_chat_id nullable)…");

  await sql`
    ALTER TABLE bank_accounts
      ALTER COLUMN telegram_chat_id DROP NOT NULL;
  `;

  console.log("Migration 042 done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
