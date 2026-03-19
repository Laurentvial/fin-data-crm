/**
 * Run migration 018 for company gérant fields.
 * Usage: node scripts/run-migration-018.js
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

  console.log("Running migration 018 (company gérant fields)...");

  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_adresse text`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_code_postal varchar(20)`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_ville varchar(255)`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_pays char(2)`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_date_naissance date`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_ville_naissance varchar(255)`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_code_postal_naissance varchar(20)`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_pays_naissance char(2)`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_numero_fiscal varchar(50)`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_numero_secu varchar(20)`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS gerant_numero_piece_identite varchar(50)`;

  console.log("Migration done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
