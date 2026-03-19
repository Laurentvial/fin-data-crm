/**
 * Run migration 017 for company extra fields.
 * Usage: node scripts/run-migration.js
 *
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

  console.log("Running migration 017 (company extra fields)...");

  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS vps varchar(255)`;
  console.log("  OK: vps");
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS forme_juridique varchar(100)`;
  console.log("  OK: forme_juridique");
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS capital_social varchar(100)`;
  console.log("  OK: capital_social");
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS code_postal varchar(20)`;
  console.log("  OK: code_postal");
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS ville varchar(255)`;
  console.log("  OK: ville");
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS activite text`;
  console.log("  OK: activite");
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS date_immatriculation date`;
  console.log("  OK: date_immatriculation");

  console.log("Migration done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
