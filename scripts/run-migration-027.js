/**
 * Run migration 027 - account_statuses table (configurable statuses like account types).
 * Replaces varchar account_status with account_status_id FK.
 * Usage: node scripts/run-migration-027.js
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

  console.log("Running migration 027 (account_statuses table)...");

  await sql`
    CREATE TABLE IF NOT EXISTS account_statuses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(255) NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp without time zone NOT NULL DEFAULT now(),
      updated_at timestamp without time zone NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS ix_account_statuses_sort_order ON account_statuses(sort_order)`;

  const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM account_statuses`;
  if (count === 0) {
    await sql`INSERT INTO account_statuses (name, sort_order) VALUES ('Ouvert', 0), ('Fermé', 1), ('Problème', 2)`;
  }

  await sql`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_status_id uuid REFERENCES account_statuses(id) ON DELETE RESTRICT`;

  // Migrate: set account_status_id from account_status varchar (if column exists)
  try {
    await sql`
      UPDATE bank_accounts ba
      SET account_status_id = COALESCE(
        (SELECT id FROM account_statuses WHERE name = ba.account_status LIMIT 1),
        (SELECT id FROM account_statuses WHERE name = 'Ouvert' LIMIT 1)
      )
      WHERE ba.account_status_id IS NULL
    `;
  } catch (e) {
    // account_status column might not exist (015 not run)
  }

  await sql`UPDATE bank_accounts SET account_status_id = (SELECT id FROM account_statuses WHERE name = 'Ouvert' LIMIT 1) WHERE account_status_id IS NULL`;

  await sql`ALTER TABLE bank_accounts DROP COLUMN IF EXISTS account_status`;
  await sql`ALTER TABLE bank_accounts ALTER COLUMN account_status_id SET NOT NULL`;

  console.log("Migration 027 done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
