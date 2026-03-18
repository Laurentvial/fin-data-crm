import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "fs";
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
    await sql`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_status varchar(20) NOT NULL DEFAULT 'Ouvert'`;
    console.log("Migration 015 applied: bank_accounts.account_status added");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

run();
