/**
 * Run migration 026 - add vat_rates array to companies.
 * Usage: node scripts/run-migration-026.js
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

  console.log("Running migration 026 (add vat_rates to companies)...");

  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_rates jsonb`;
  await sql`UPDATE companies SET vat_rates = jsonb_build_array(COALESCE(vat_rate, 20)) WHERE vat_rates IS NULL`;
  await sql`ALTER TABLE companies ALTER COLUMN vat_rates SET DEFAULT '[20]'::jsonb`;

  console.log("Migration done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
