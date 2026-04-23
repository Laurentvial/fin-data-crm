/**
 * Run migration 043 — INTERNAL_CREDIT + internal_transfer_debit_id + apply_internal_credit_pair().
 * Usage: node scripts/run-migration-043.js
 * Or: npm run migrate:043
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

  const migrationPath = path.join(__dirname, "..", "migrations", "043_internal_credit_transfer.sql");
  const raw = fs.readFileSync(migrationPath, "utf8");
  const chunks = raw.split(/\n-- @section \w+\n/).slice(1);

  console.log("Running migration 043 (internal credit transfer)…");
  for (let i = 0; i < chunks.length; i++) {
    const stmt = chunks[i].trim();
    if (!stmt) continue;
    await sql.query(stmt);
    console.log(`  step ${i + 1}/${chunks.length} ok`);
  }
  console.log("Migration 043 done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
