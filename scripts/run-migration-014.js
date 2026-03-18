import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Load .env.local if exists
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function run() {
  try {
    await sql`CREATE TABLE IF NOT EXISTS account_types (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(255) NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp without time zone NOT NULL DEFAULT now(),
      updated_at timestamp without time zone NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS ix_account_types_sort_order ON account_types(sort_order)`;
    await sql`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_type_id uuid REFERENCES account_types(id) ON DELETE SET NULL`;
    console.log("Migration 014 applied: account_types table and bank_accounts.account_type_id added");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

run();
