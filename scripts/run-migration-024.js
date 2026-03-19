/**
 * Run migration 024 - add is_default to company_emails and company_phones.
 * Usage: node scripts/run-migration-024.js
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

  console.log("Running migration 024 (add is_default to company_emails and company_phones)...");

  await sql`ALTER TABLE company_emails ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE company_phones ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false`;

  // Set first email per company as default if none exists
  const emailRows = await sql`
    SELECT ce.id, ce.company_id FROM company_emails ce
    WHERE NOT EXISTS (
      SELECT 1 FROM company_emails ce2
      WHERE ce2.company_id = ce.company_id AND ce2.is_default = true
    )
    AND ce.id = (
      SELECT id FROM company_emails
      WHERE company_id = ce.company_id
      ORDER BY created_at ASC
      LIMIT 1
    )
  `;
  for (const row of emailRows) {
    await sql`UPDATE company_emails SET is_default = true WHERE id = ${row.id}`;
  }

  // Set first phone per company as default if none exists
  const phoneRows = await sql`
    SELECT cp.id FROM company_phones cp
    WHERE NOT EXISTS (
      SELECT 1 FROM company_phones cp2
      WHERE cp2.company_id = cp.company_id AND cp2.is_default = true
    )
    AND cp.id = (
      SELECT id FROM company_phones
      WHERE company_id = cp.company_id
      ORDER BY created_at ASC
      LIMIT 1
    )
  `;
  for (const row of phoneRows) {
    await sql`UPDATE company_phones SET is_default = true WHERE id = ${row.id}`;
  }

  console.log("Migration done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
