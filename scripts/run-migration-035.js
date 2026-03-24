/**
 * Run migration 035 - fournisseurs table and transactions.fournisseur_id.
 * Usage: node scripts/run-migration-035.js
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

  console.log("Running migration 035 (fournisseurs)...");

  await sql`
    CREATE TABLE IF NOT EXISTS fournisseurs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(255) NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp without time zone NOT NULL DEFAULT now(),
      updated_at timestamp without time zone NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS ix_fournisseurs_sort_order ON fournisseurs(sort_order)`;
  await sql`
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fournisseur_id uuid REFERENCES fournisseurs(id) ON DELETE SET NULL
  `;
  await sql`CREATE INDEX IF NOT EXISTS ix_transactions_fournisseur_id ON transactions(fournisseur_id)`;

  console.log("Migration 035 done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
