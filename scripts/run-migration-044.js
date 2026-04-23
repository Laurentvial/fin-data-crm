/**
 * Run migration 044 — replace apply_internal_credit_pair() (appariement inter-sociétés).
 * Usage: node scripts/run-migration-044.js
 * Or: npm run migrate:044
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

  const migrationPath = path.join(__dirname, "..", "migrations", "044_internal_credit_pair_any_company.sql");
  const stmt = fs.readFileSync(migrationPath, "utf8").trim();

  console.log("Running migration 044 (apply_internal_credit_pair — any company)…");
  await sql.query(stmt);
  console.log("Migration 044 done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
