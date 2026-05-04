/**
 * Run migration 047 — customers.siret + invoices.customer_siret.
 * Usage: node scripts/run-migration-047.js
 * Or: npm run migrate:047
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

  const migrationPath = path.join(__dirname, "..", "migrations", "047_customer_siret.sql");
  const fileText = fs.readFileSync(migrationPath, "utf8");
  /** Neon: one statement per prepared query — split multi-statement migrations. */
  function segmentHasSql(s) {
    return s
      .split("\n")
      .map((l) => l.trim())
      .some((l) => l.length > 0 && !l.startsWith("--"));
  }
  const statements = fileText
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && segmentHasSql(s));

  console.log("Running migration 047 (customer siret on customers + invoices)…");
  for (let i = 0; i < statements.length; i++) {
    const q = statements[i].endsWith(";") ? statements[i] : `${statements[i]};`;
    console.log(`  [${i + 1}/${statements.length}] ${q.split("\n")[0].slice(0, 72)}…`);
    await sql.query(q);
  }
  console.log("Migration 047 done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
