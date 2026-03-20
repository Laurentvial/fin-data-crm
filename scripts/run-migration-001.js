/**
 * Run migration 001 - change transactions.processed_by_user_id from bigint to uuid.
 * ⚠️ WARNING: Do NOT run if another service (e.g. Python) uses bigint (Telegram IDs).
 * That service would break. Use revert-migration-001.js to undo.
 *
 * Usage: node scripts/run-migration-001.js
 * Loads DATABASE_URL from .env.local (or .env) in project root.
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

  console.log("Running migration 001 (processed_by_user_id bigint -> uuid)...");

  await sql`ALTER TABLE transactions DROP COLUMN IF EXISTS processed_by_user_id`;
  console.log("  OK: dropped old column");

  await sql`ALTER TABLE transactions ADD COLUMN processed_by_user_id uuid NULL`;
  console.log("  OK: added processed_by_user_id as uuid");

  await sql`COMMENT ON COLUMN transactions.processed_by_user_id IS 'References neon_auth.user.id'`;
  console.log("  OK: added comment");

  console.log("Migration done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
