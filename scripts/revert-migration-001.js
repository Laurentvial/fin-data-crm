/**
 * Revert migration 001 - change transactions.processed_by_user_id back from uuid to bigint.
 * Required because another service (Python) uses bigint (Telegram IDs) for this column.
 * Usage: node scripts/revert-migration-001.js
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

  console.log("Reverting migration 001 (processed_by_user_id uuid -> bigint)...");

  await sql`ALTER TABLE transactions DROP COLUMN IF EXISTS processed_by_user_id`;
  console.log("  OK: dropped uuid column");

  await sql`ALTER TABLE transactions ADD COLUMN processed_by_user_id bigint NULL`;
  console.log("  OK: added processed_by_user_id as bigint");

  await sql`COMMENT ON COLUMN transactions.processed_by_user_id IS 'Telegram user ID (bigint) - used by Python service; Next.js maps via user_telegram'`;
  console.log("  OK: added comment");

  console.log("Revert done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
