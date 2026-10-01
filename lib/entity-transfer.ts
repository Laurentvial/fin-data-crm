import { sql } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";
import {
  ENTITY_ENTITIES,
  ENTITY_EXPORT_LIMIT,
  ENTITY_FORMAT_VERSION,
  ENTITY_KIND,
  type EntityTransferEntity,
} from "@/lib/entity-transfer-constants";

export {
  ENTITY_ENTITIES,
  ENTITY_EXPORT_LIMIT,
  ENTITY_FORMAT_VERSION,
  ENTITY_KIND,
  type EntityTransferEntity,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isEntityTransferEntity(value: unknown): value is EntityTransferEntity {
  return (
    typeof value === "string" &&
    (ENTITY_ENTITIES as readonly string[]).includes(value)
  );
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export class EntityTransferError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "EntityTransferError";
    this.status = status;
  }
}

export type EntityExportPayload = {
  kind: typeof ENTITY_KIND;
  format_version: typeof ENTITY_FORMAT_VERSION;
  entity: EntityTransferEntity;
  exported_at: string;
  limit: number;
  requested_count: number;
  items: unknown[];
  companies?: unknown[];
};

export type EntityImportResult = {
  entity: EntityTransferEntity;
  inserted: number;
  skipped: number;
  companies_inserted?: number;
  companies_skipped?: number;
};

type FileItem = {
  file_type: string;
  filename: string | null;
  content_type: string | null;
  data_base64: string;
};

type CompanyEmailItem = {
  id: string;
  email: string;
  password: string;
  is_default: boolean;
};

type CompanyPhoneItem = {
  id: string;
  phone: string;
  operateur: string | null;
  is_default: boolean;
};

type CompanyItem = {
  id: string;
  name: string;
  address: string | null;
  siret: string | null;
  directeur: string | null;
  website: string | null;
  vps: string | null;
  forme_juridique: string | null;
  capital_social: string | null;
  code_postal: string | null;
  ville: string | null;
  activite: string | null;
  date_immatriculation: string | null;
  country_code: string;
  source_id: string | null;
  fournisseur: string | null;
  gerant_adresse: string | null;
  gerant_code_postal: string | null;
  gerant_ville: string | null;
  gerant_pays: string | null;
  gerant_date_naissance: string | null;
  gerant_ville_naissance: string | null;
  gerant_code_postal_naissance: string | null;
  gerant_pays_naissance: string | null;
  gerant_numero_fiscal: string | null;
  gerant_numero_secu: string | null;
  gerant_numero_piece_identite: string | null;
  vat_number: string | null;
  vat_rate: number | null;
  vat_rates: number[];
  invoice_prefix: string;
  invoice_next_number: number;
  currency: string;
  invoice_template_id: string | null;
  bloc_notes: string | null;
  emails: CompanyEmailItem[];
  phones: CompanyPhoneItem[];
  files: FileItem[];
};

type BankAccountItem = {
  id: string;
  company_id: string;
  name: string;
  telegram_chat_id: string | null;
  bank_id: string | null;
  account_type_id: string | null;
  account_status_id: string | null;
  login: string | null;
  password: string | null;
  pin_code: string | null;
  plafond_limit: string | null;
  company_email_id: string | null;
  company_phone_id: string | null;
  ibans: Array<{ iban: string; bic: string | null }>;
  cards: Array<{ numero: string; date_expiration: string | null; cvv: string | null }>;
  files: FileItem[];
};

function asRows(rows: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return rows ? [rows as Record<string, unknown>] : [];
  return rows.filter(Boolean) as Record<string, unknown>[];
}

function optionalString(value: unknown, max?: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return max != null ? trimmed.slice(0, max) : trimmed;
}

function optionalUuid(value: unknown): string | null {
  return isUuid(value) ? value : null;
}

function asInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Math.trunc(Number(value));
  }
  return fallback;
}

function parseVatRates(value: unknown, fallbackVatRate: unknown): number[] {
  const fromArray = Array.isArray(value)
    ? value
        .map((v) => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 100)
    : [];
  if (fromArray.length > 0) return fromArray;
  const single =
    typeof fallbackVatRate === "number"
      ? fallbackVatRate
      : typeof fallbackVatRate === "string"
        ? parseFloat(fallbackVatRate)
        : NaN;
  if (Number.isFinite(single) && single >= 0 && single <= 100) return [single];
  return [20];
}

function parseFile(value: unknown): FileItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const fileType = optionalString(row.file_type, 50);
  const data = typeof row.data_base64 === "string" ? row.data_base64.trim() : "";
  if (!fileType || !data) return null;
  return {
    file_type: fileType,
    filename: optionalString(row.filename, 255),
    content_type: optionalString(row.content_type, 100),
    data_base64: data,
  };
}

function decryptStoredPassword(stored: unknown): string {
  if (typeof stored !== "string" || !stored) return "";
  try {
    return decrypt(stored);
  } catch {
    return "";
  }
}

function telegramChatIdToString(value: unknown): string | null {
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === "bigint") return value.toString();
  return null;
}

export function normalizeExportIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    if (!isUuid(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

export async function exportEntities(
  entity: EntityTransferEntity,
  ids: unknown
): Promise<EntityExportPayload> {
  const requested = normalizeExportIds(ids);
  const limited = requested.slice(0, ENTITY_EXPORT_LIMIT);
  if (entity === "companies") {
    return {
      kind: ENTITY_KIND,
      format_version: ENTITY_FORMAT_VERSION,
      entity,
      exported_at: new Date().toISOString(),
      limit: ENTITY_EXPORT_LIMIT,
      requested_count: requested.length,
      items: await loadCompanies(limited),
    };
  }
  const accounts = await loadBankAccounts(limited);
  const companyIds = [...new Set(accounts.map((a) => a.company_id).filter(isUuid))];
  return {
    kind: ENTITY_KIND,
    format_version: ENTITY_FORMAT_VERSION,
    entity,
    exported_at: new Date().toISOString(),
    limit: ENTITY_EXPORT_LIMIT,
    requested_count: requested.length,
    items: accounts,
    companies: await loadCompanies(companyIds),
  };
}

async function loadCompanies(ids: string[]): Promise<CompanyItem[]> {
  if (ids.length === 0) return [];
  const rows = asRows(
    await sql`
      SELECT
        id, name, address, siret, directeur, website, vps, forme_juridique, capital_social,
        code_postal, ville, activite, date_immatriculation, country_code, source_id, fournisseur,
        gerant_adresse, gerant_code_postal, gerant_ville, gerant_pays, gerant_date_naissance,
        gerant_ville_naissance, gerant_code_postal_naissance, gerant_pays_naissance,
        gerant_numero_fiscal, gerant_numero_secu, gerant_numero_piece_identite,
        vat_number, vat_rate, vat_rates, invoice_prefix, invoice_next_number, currency,
        invoice_template_id, bloc_notes
      FROM companies
      WHERE id = ANY(${ids}::uuid[])
    `
  );
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const items: CompanyItem[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    items.push(await hydrateCompany(id, r));
  }
  return items;
}

async function hydrateCompany(id: string, r: Record<string, unknown>): Promise<CompanyItem> {
  const emailRows = asRows(
    await sql`
      SELECT id, email, password, is_default
      FROM company_emails
      WHERE company_id = ${id}::uuid
      ORDER BY is_default DESC, email
    `
  );
  const phoneRows = asRows(
    await sql`
      SELECT id, phone, operateur, is_default
      FROM company_phones
      WHERE company_id = ${id}::uuid
      ORDER BY is_default DESC, phone
    `
  );
  const fileRows = asRows(
    await sql`
      SELECT file_type, filename, content_type, data_base64
      FROM company_files
      WHERE company_id = ${id}::uuid
    `
  );
  const vatRates = parseVatRates(r.vat_rates, r.vat_rate);
  return {
    id,
    name: String(r.name ?? ""),
    address: optionalString(r.address),
    siret: optionalString(r.siret),
    directeur: optionalString(r.directeur),
    website: optionalString(r.website),
    vps: optionalString(r.vps),
    forme_juridique: optionalString(r.forme_juridique),
    capital_social: optionalString(r.capital_social),
    code_postal: optionalString(r.code_postal),
    ville: optionalString(r.ville),
    activite: optionalString(r.activite),
    date_immatriculation: optionalString(r.date_immatriculation),
    country_code: (optionalString(r.country_code, 2) ?? "FR").toUpperCase(),
    source_id: optionalUuid(r.source_id),
    fournisseur: optionalString(r.fournisseur, 255),
    gerant_adresse: optionalString(r.gerant_adresse),
    gerant_code_postal: optionalString(r.gerant_code_postal),
    gerant_ville: optionalString(r.gerant_ville),
    gerant_pays: optionalString(r.gerant_pays, 2),
    gerant_date_naissance: optionalString(r.gerant_date_naissance),
    gerant_ville_naissance: optionalString(r.gerant_ville_naissance),
    gerant_code_postal_naissance: optionalString(r.gerant_code_postal_naissance),
    gerant_pays_naissance: optionalString(r.gerant_pays_naissance, 2),
    gerant_numero_fiscal: optionalString(r.gerant_numero_fiscal),
    gerant_numero_secu: optionalString(r.gerant_numero_secu),
    gerant_numero_piece_identite: optionalString(r.gerant_numero_piece_identite),
    vat_number: optionalString(r.vat_number),
    vat_rate: vatRates[0] ?? 20,
    vat_rates: vatRates,
    invoice_prefix: optionalString(r.invoice_prefix, 20) ?? "FAC-",
    invoice_next_number: Math.max(1, asInt(r.invoice_next_number, 1)),
    currency: (optionalString(r.currency, 3) ?? "EUR").toUpperCase(),
    invoice_template_id: optionalUuid(r.invoice_template_id),
    bloc_notes: optionalString(r.bloc_notes),
    emails: emailRows
      .filter((e) => isUuid(e.id) && optionalString(e.email))
      .map((e) => ({
        id: String(e.id),
        email: String(e.email),
        password: decryptStoredPassword(e.password),
        is_default: Boolean(e.is_default),
      })),
    phones: phoneRows
      .filter((p) => isUuid(p.id) && optionalString(p.phone))
      .map((p) => ({
        id: String(p.id),
        phone: String(p.phone),
        operateur: optionalString(p.operateur, 120),
        is_default: Boolean(p.is_default),
      })),
    files: fileRows.map(parseFile).filter((f): f is FileItem => f != null),
  };
}

async function loadBankAccounts(ids: string[]): Promise<BankAccountItem[]> {
  if (ids.length === 0) return [];
  const rows = asRows(
    await sql`
      SELECT
        id, company_id, name, telegram_chat_id, bank_id, account_type_id, account_status_id,
        login, password, pin_code, plafond_limit, company_email_id, company_phone_id
      FROM bank_accounts
      WHERE id = ANY(${ids}::uuid[])
    `
  );
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const items: BankAccountItem[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r || !isUuid(r.company_id)) continue;
    const ibanRows = asRows(
      await sql`
        SELECT iban, bic
        FROM bank_account_ibans
        WHERE bank_account_id = ${id}::uuid
        ORDER BY created_at
      `
    );
    const cardRows = asRows(
      await sql`
        SELECT numero, date_expiration, cvv
        FROM bank_account_cards
        WHERE bank_account_id = ${id}::uuid
        ORDER BY created_at
      `
    );
    const fileRows = asRows(
      await sql`
        SELECT file_type, filename, content_type, data_base64
        FROM bank_account_files
        WHERE bank_account_id = ${id}::uuid
      `
    );
    items.push({
      id,
      company_id: String(r.company_id),
      name: String(r.name ?? ""),
      telegram_chat_id: telegramChatIdToString(r.telegram_chat_id),
      bank_id: optionalUuid(r.bank_id),
      account_type_id: optionalUuid(r.account_type_id),
      account_status_id: optionalUuid(r.account_status_id),
      login: optionalString(r.login, 255),
      password: optionalString(r.password, 500),
      pin_code: optionalString(r.pin_code, 20),
      plafond_limit: optionalString(r.plafond_limit, 100),
      company_email_id: optionalUuid(r.company_email_id),
      company_phone_id: optionalUuid(r.company_phone_id),
      ibans: ibanRows
        .map((i) => ({
          iban: optionalString(i.iban, 34) ?? "",
          bic: optionalString(i.bic, 11),
        }))
        .filter((i) => i.iban),
      cards: cardRows
        .map((c) => ({
          numero: optionalString(c.numero, 19) ?? "",
          date_expiration: optionalString(c.date_expiration, 7),
          cvv: optionalString(c.cvv, 4),
        }))
        .filter((c) => c.numero),
      files: fileRows.map(parseFile).filter((f): f is FileItem => f != null),
    });
  }
  return items;
}

export function parseEntityPayload(body: unknown): EntityExportPayload {
  if (!body || typeof body !== "object") {
    throw new EntityTransferError("Fichier d'import invalide.");
  }
  const payload = body as Record<string, unknown>;
  if (payload.kind !== ENTITY_KIND) {
    throw new EntityTransferError("Ce fichier n'est pas un export Sociétés / Comptes.");
  }
  if (payload.format_version !== ENTITY_FORMAT_VERSION) {
    throw new EntityTransferError(
      `Version de format non supportée (${String(payload.format_version)}).`
    );
  }
  if (!isEntityTransferEntity(payload.entity)) {
    throw new EntityTransferError("Type d'entité inconnu.");
  }
  if (!Array.isArray(payload.items)) {
    throw new EntityTransferError("Le fichier ne contient pas de liste d'éléments.");
  }
  return {
    kind: ENTITY_KIND,
    format_version: ENTITY_FORMAT_VERSION,
    entity: payload.entity,
    exported_at:
      typeof payload.exported_at === "string" ? payload.exported_at : new Date().toISOString(),
    limit: ENTITY_EXPORT_LIMIT,
    requested_count: asInt(payload.requested_count, payload.items.length),
    items: payload.items,
    companies: Array.isArray(payload.companies) ? payload.companies : undefined,
  };
}

export async function importEntities(body: unknown): Promise<EntityImportResult> {
  const payload = parseEntityPayload(body);
  if (payload.entity === "companies") {
    const result = await importCompanies(payload.items);
    return { entity: "companies", inserted: result.inserted, skipped: result.skipped };
  }
  const companiesResult = await importCompanies(payload.companies ?? []);
  const accountsResult = await importBankAccounts(payload.items);
  return {
    entity: "bank_accounts",
    inserted: accountsResult.inserted,
    skipped: accountsResult.skipped,
    companies_inserted: companiesResult.inserted,
    companies_skipped: companiesResult.skipped,
  };
}

async function loadExistingIds(
  table:
    | "companies"
    | "sources"
    | "invoice_templates"
    | "banks"
    | "account_types"
    | "account_statuses"
    | "company_emails"
    | "company_phones"
    | "bank_accounts"
): Promise<Set<string>> {
  const rows = asRows(await selectIdsFromTable(table));
  return new Set(rows.map((r) => String(r.id)).filter(isUuid));
}

async function selectIdsFromTable(
  table:
    | "companies"
    | "sources"
    | "invoice_templates"
    | "banks"
    | "account_types"
    | "account_statuses"
    | "company_emails"
    | "company_phones"
    | "bank_accounts"
) {
  switch (table) {
    case "companies":
      return sql`SELECT id FROM companies`;
    case "sources":
      return sql`SELECT id FROM sources`;
    case "invoice_templates":
      return sql`SELECT id FROM invoice_templates`;
    case "banks":
      return sql`SELECT id FROM banks`;
    case "account_types":
      return sql`SELECT id FROM account_types`;
    case "account_statuses":
      return sql`SELECT id FROM account_statuses`;
    case "company_emails":
      return sql`SELECT id FROM company_emails`;
    case "company_phones":
      return sql`SELECT id FROM company_phones`;
    case "bank_accounts":
      return sql`SELECT id FROM bank_accounts`;
  }
}

async function importCompanies(items: unknown[]): Promise<{ inserted: number; skipped: number }> {
  const existingIds = await loadExistingIds("companies");
  const sourceIds = await loadExistingIds("sources");
  const templateIds = await loadExistingIds("invoice_templates");

  let inserted = 0;
  let skipped = 0;

  for (const raw of items) {
    if (!raw || typeof raw !== "object") {
      skipped += 1;
      continue;
    }
    const item = raw as Record<string, unknown>;
    if (!isUuid(item.id)) {
      skipped += 1;
      continue;
    }
    const name = optionalString(item.name, 255);
    if (!name) {
      skipped += 1;
      continue;
    }
    if (existingIds.has(item.id)) {
      skipped += 1;
      continue;
    }

    const vatRates = parseVatRates(item.vat_rates, item.vat_rate);
    const sourceId = optionalUuid(item.source_id);
    const templateId = optionalUuid(item.invoice_template_id);
    const countryCode = (optionalString(item.country_code, 2) ?? "FR").toUpperCase();

    await sql`
      INSERT INTO companies (
        id, name, address, siret, directeur, website, vps, forme_juridique, capital_social,
        code_postal, ville, activite, date_immatriculation, country_code, source_id, fournisseur,
        gerant_adresse, gerant_code_postal, gerant_ville, gerant_pays, gerant_date_naissance,
        gerant_ville_naissance, gerant_code_postal_naissance, gerant_pays_naissance,
        gerant_numero_fiscal, gerant_numero_secu, gerant_numero_piece_identite,
        vat_number, vat_rate, vat_rates, invoice_prefix, invoice_next_number, currency,
        invoice_template_id, bloc_notes
      )
      VALUES (
        ${item.id}::uuid,
        ${name},
        ${optionalString(item.address)},
        ${optionalString(item.siret)},
        ${optionalString(item.directeur)},
        ${optionalString(item.website)},
        ${optionalString(item.vps)},
        ${optionalString(item.forme_juridique)},
        ${optionalString(item.capital_social)},
        ${optionalString(item.code_postal)},
        ${optionalString(item.ville)},
        ${optionalString(item.activite)},
        ${optionalString(item.date_immatriculation)},
        ${countryCode},
        ${sourceId && sourceIds.has(sourceId) ? sourceId : null},
        ${optionalString(item.fournisseur, 255)},
        ${optionalString(item.gerant_adresse)},
        ${optionalString(item.gerant_code_postal)},
        ${optionalString(item.gerant_ville)},
        ${optionalString(item.gerant_pays, 2)},
        ${optionalString(item.gerant_date_naissance)},
        ${optionalString(item.gerant_ville_naissance)},
        ${optionalString(item.gerant_code_postal_naissance)},
        ${optionalString(item.gerant_pays_naissance, 2)},
        ${optionalString(item.gerant_numero_fiscal)},
        ${optionalString(item.gerant_numero_secu)},
        ${optionalString(item.gerant_numero_piece_identite)},
        ${optionalString(item.vat_number)},
        ${vatRates[0] ?? 20},
        ${JSON.stringify(vatRates)}::jsonb,
        ${optionalString(item.invoice_prefix, 20) ?? "FAC-"},
        ${Math.max(1, asInt(item.invoice_next_number, 1))},
        ${(optionalString(item.currency, 3) ?? "EUR").toUpperCase()},
        ${templateId && templateIds.has(templateId) ? templateId : null},
        ${optionalString(item.bloc_notes)}
      )
    `;

    existingIds.add(item.id);
    await insertCompanyRelations(item.id, item);
    inserted += 1;
  }

  return { inserted, skipped };
}

async function insertCompanyRelations(companyId: string, item: Record<string, unknown>) {
  const emails = Array.isArray(item.emails) ? item.emails : [];
  for (const raw of emails) {
    if (!raw || typeof raw !== "object") continue;
    const email = raw as Record<string, unknown>;
    if (!isUuid(email.id)) continue;
    const address = optionalString(email.email, 255);
    if (!address) continue;
    const password = typeof email.password === "string" ? email.password : "";
    const encrypted = encrypt(password);
    await sql`
      INSERT INTO company_emails (id, company_id, email, password, is_default)
      VALUES (${email.id}::uuid, ${companyId}::uuid, ${address}, ${encrypted}, ${Boolean(email.is_default)})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  const phones = Array.isArray(item.phones) ? item.phones : [];
  for (const raw of phones) {
    if (!raw || typeof raw !== "object") continue;
    const phone = raw as Record<string, unknown>;
    if (!isUuid(phone.id)) continue;
    const number = optionalString(phone.phone, 50);
    if (!number) continue;
    await sql`
      INSERT INTO company_phones (id, company_id, phone, operateur, is_default)
      VALUES (
        ${phone.id}::uuid,
        ${companyId}::uuid,
        ${number},
        ${optionalString(phone.operateur, 120)},
        ${Boolean(phone.is_default)}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  const files = Array.isArray(item.files) ? item.files : [];
  for (const raw of files) {
    const file = parseFile(raw);
    if (!file) continue;
    await sql`
      INSERT INTO company_files (company_id, file_type, filename, content_type, data_base64)
      VALUES (${companyId}::uuid, ${file.file_type}, ${file.filename}, ${file.content_type}, ${file.data_base64})
      ON CONFLICT (company_id, file_type)
      DO UPDATE SET
        filename = EXCLUDED.filename,
        content_type = EXCLUDED.content_type,
        data_base64 = EXCLUDED.data_base64
    `;
  }
}

async function defaultAccountStatusId(): Promise<string | null> {
  const preferred = asRows(
    await sql`
      SELECT id FROM account_statuses
      WHERE is_default = true
      LIMIT 1
    `
  );
  if (preferred[0] && isUuid(preferred[0].id)) return String(preferred[0].id);
  const fallback = asRows(
    await sql`
      SELECT id FROM account_statuses
      ORDER BY sort_order, name
      LIMIT 1
    `
  );
  if (fallback[0] && isUuid(fallback[0].id)) return String(fallback[0].id);
  return null;
}

async function importBankAccounts(items: unknown[]): Promise<{ inserted: number; skipped: number }> {
  const existingAccountIds = await loadExistingIds("bank_accounts");
  const companyIds = await loadExistingIds("companies");
  const bankIds = await loadExistingIds("banks");
  const accountTypeIds = await loadExistingIds("account_types");
  const accountStatusIds = await loadExistingIds("account_statuses");
  const emailIds = await loadExistingIds("company_emails");
  const phoneIds = await loadExistingIds("company_phones");
  const fallbackStatusId = await defaultAccountStatusId();

  let inserted = 0;
  let skipped = 0;

  for (const raw of items) {
    if (!raw || typeof raw !== "object") {
      skipped += 1;
      continue;
    }
    const item = raw as Record<string, unknown>;
    if (!isUuid(item.id) || !isUuid(item.company_id)) {
      skipped += 1;
      continue;
    }
    const name = optionalString(item.name, 255);
    if (!name) {
      skipped += 1;
      continue;
    }
    if (existingAccountIds.has(item.id) || !companyIds.has(item.company_id)) {
      skipped += 1;
      continue;
    }

    const requestedStatus = optionalUuid(item.account_status_id);
    const accountStatusId =
      requestedStatus && accountStatusIds.has(requestedStatus)
        ? requestedStatus
        : fallbackStatusId;
    if (!accountStatusId) {
      throw new EntityTransferError(
        "Aucun statut de compte sur la cible. Importez d'abord les statuts depuis Paramètres.",
        409
      );
    }

    const bankId = optionalUuid(item.bank_id);
    const accountTypeId = optionalUuid(item.account_type_id);
    const emailId = optionalUuid(item.company_email_id);
    const phoneId = optionalUuid(item.company_phone_id);
    let telegramChatId = telegramChatIdToString(item.telegram_chat_id);
    if (telegramChatId) {
      const taken = asRows(
        await sql`
          SELECT 1 FROM bank_accounts
          WHERE telegram_chat_id = ${telegramChatId}
          LIMIT 1
        `
      );
      if (taken.length > 0) telegramChatId = null;
    }

    await sql`
      INSERT INTO bank_accounts (
        id, company_id, name, telegram_chat_id, bank_id, account_type_id, account_status_id,
        login, password, pin_code, plafond_limit, company_email_id, company_phone_id
      )
      VALUES (
        ${item.id}::uuid,
        ${item.company_id}::uuid,
        ${name},
        ${telegramChatId},
        ${bankId && bankIds.has(bankId) ? bankId : null},
        ${accountTypeId && accountTypeIds.has(accountTypeId) ? accountTypeId : null},
        ${accountStatusId}::uuid,
        ${optionalString(item.login, 255)},
        ${optionalString(item.password, 500)},
        ${optionalString(item.pin_code, 20)},
        ${optionalString(item.plafond_limit, 100)},
        ${emailId && emailIds.has(emailId) ? emailId : null},
        ${phoneId && phoneIds.has(phoneId) ? phoneId : null}
      )
    `;

    const ibans = Array.isArray(item.ibans) ? item.ibans : [];
    for (const rawIban of ibans) {
      if (!rawIban || typeof rawIban !== "object") continue;
      const iban = optionalString((rawIban as Record<string, unknown>).iban, 34);
      if (!iban) continue;
      const bic = optionalString((rawIban as Record<string, unknown>).bic, 11);
      await sql`
        INSERT INTO bank_account_ibans (bank_account_id, iban, bic)
        VALUES (${item.id}::uuid, ${iban}, ${bic})
        ON CONFLICT (bank_account_id, iban) DO NOTHING
      `;
    }

    const cards = Array.isArray(item.cards) ? item.cards : [];
    for (const rawCard of cards) {
      if (!rawCard || typeof rawCard !== "object") continue;
      const card = rawCard as Record<string, unknown>;
      const numero = optionalString(card.numero, 19);
      if (!numero) continue;
      await sql`
        INSERT INTO bank_account_cards (bank_account_id, numero, date_expiration, cvv)
        VALUES (
          ${item.id}::uuid,
          ${numero},
          ${optionalString(card.date_expiration, 7)},
          ${optionalString(card.cvv, 4)}
        )
      `;
    }

    const files = Array.isArray(item.files) ? item.files : [];
    for (const rawFile of files) {
      const file = parseFile(rawFile);
      if (!file) continue;
      await sql`
        INSERT INTO bank_account_files (bank_account_id, file_type, filename, content_type, data_base64)
        VALUES (${item.id}::uuid, ${file.file_type}, ${file.filename}, ${file.content_type}, ${file.data_base64})
        ON CONFLICT (bank_account_id, file_type)
        DO UPDATE SET
          filename = EXCLUDED.filename,
          content_type = EXCLUDED.content_type,
          data_base64 = EXCLUDED.data_base64
      `;
    }

    existingAccountIds.add(item.id);
    inserted += 1;
  }

  return { inserted, skipped };
}
