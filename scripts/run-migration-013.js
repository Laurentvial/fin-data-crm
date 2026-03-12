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
    await sql`CREATE TABLE IF NOT EXISTS customers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name text NOT NULL,
      address text,
      vat_number varchar(50),
      created_at timestamp without time zone NOT NULL DEFAULT now(),
      updated_at timestamp without time zone NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS ix_customers_company_id ON customers(company_id)`;
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL`;
    await sql`CREATE INDEX IF NOT EXISTS ix_invoices_customer_id ON invoices(customer_id)`;
    console.log("Migration 013 applied: customers table and invoice.customer_id added");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

run();
