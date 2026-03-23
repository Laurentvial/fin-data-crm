/**
 * Run migration 031 - add emoji to account_types and account_statuses.
 * Usage: node scripts/run-migration-031.js
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

  console.log("Running migration 031 (account_types and account_statuses emoji)...");

  await sql`ALTER TABLE account_types ADD COLUMN IF NOT EXISTS emoji varchar(20) NULL`;
  await sql`ALTER TABLE account_statuses ADD COLUMN IF NOT EXISTS emoji varchar(20) NULL`;

  console.log("Migration 031 done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
