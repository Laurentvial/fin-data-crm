import { neon } from "@neondatabase/serverless";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

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
    await sql`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS login varchar(255)`;
    await sql`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS password varchar(500)`;
    await sql`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS pin_code varchar(20)`;
    await sql`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS plafond_limit varchar(100)`;
    await sql`
      CREATE TABLE IF NOT EXISTS bank_account_cards (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
        numero varchar(19) NOT NULL,
        date_expiration varchar(7),
        cvv varchar(4),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_bank_account_cards_bank_account_id ON bank_account_cards(bank_account_id)`;
    await sql`
      CREATE TABLE IF NOT EXISTS bank_account_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
        file_type varchar(20) NOT NULL,
        filename varchar(255),
        content_type varchar(100),
        data_base64 text NOT NULL,
        created_at timestamp without time zone NOT NULL DEFAULT now(),
        UNIQUE(bank_account_id, file_type)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS ix_bank_account_files_bank_account_id ON bank_account_files(bank_account_id)`;
    console.log("Migration 016 applied: bank_account extra fields, cards, RIB files");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

run();
