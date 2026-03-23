/**
 * Run migration 029 - add is_default to account_statuses.
 * Usage: node scripts/run-migration-029.js
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

  console.log("Running migration 029 (account_statuses is_default)...");

  await sql`ALTER TABLE account_statuses ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false`;

  const [ouvert] = await sql`SELECT id FROM account_statuses WHERE name = 'Ouvert' LIMIT 1`;
  if (ouvert) {
    await sql`UPDATE account_statuses SET is_default = false`;
    await sql`UPDATE account_statuses SET is_default = true WHERE id = ${ouvert.id}`;
  } else {
    const [first] = await sql`SELECT id FROM account_statuses ORDER BY sort_order, name LIMIT 1`;
    if (first) {
      const [hasDefault] = await sql`SELECT 1 FROM account_statuses WHERE is_default = true LIMIT 1`;
      if (!hasDefault) {
        await sql`UPDATE account_statuses SET is_default = true WHERE id = ${first.id}`;
      }
    }
  }

  console.log("Migration 029 done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
