/**
 * Run migration 040 - app_super_admins (super-admin access for Rapports).
 * Usage: node scripts/run-migration-040.js
 * Or: npm run migrate:040
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

  console.log("Running migration 040 (app_super_admins)...");

  await sql`
    CREATE TABLE IF NOT EXISTS app_super_admins (
      user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  console.log("  OK: table app_super_admins");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_app_super_admins_user_id ON app_super_admins (user_id)
  `;
  console.log("  OK: index idx_app_super_admins_user_id");

  console.log("Migration 040 done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
