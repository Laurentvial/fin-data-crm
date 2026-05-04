/**
 * Run migration 046 — allow invoices without a due date (nullable due_date).
 * Usage: node scripts/run-migration-046.js
 * Or: npm run migrate:046
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

  const migrationPath = path.join(__dirname, "..", "migrations", "046_invoices_due_date_nullable.sql");
  const stmt = fs.readFileSync(migrationPath, "utf8").trim();

  console.log("Running migration 046 (invoices.due_date nullable)…");
  await sql.query(stmt);
  console.log("Migration 046 done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
