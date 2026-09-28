import { sql } from "@/lib/db";

export const CATALOG_KIND = "bigboss-catalog-export" as const;
export const CATALOG_FORMAT_VERSION = 1 as const;

export const CATALOG_ENTITIES = [
  "templates",
  "clients",
  "statuses",
  "sources",
  "fournisseurs",
  "banks",
] as const;
export type CatalogEntity = (typeof CATALOG_ENTITIES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCatalogEntity(value: unknown): value is CatalogEntity {
  return (
    typeof value === "string" &&
    (CATALOG_ENTITIES as readonly string[]).includes(value)
  );
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type CatalogExportPayload = {
  kind: typeof CATALOG_KIND;
  format_version: typeof CATALOG_FORMAT_VERSION;
  entity: CatalogEntity;
  exported_at: string;
  items: unknown[];
};

export type CatalogImportResult = {
  entity: CatalogEntity;
  inserted: number;
  skipped: number;
};

export class CatalogTransferError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "CatalogTransferError";
    this.status = status;
  }
}

type BankLogo = {
  filename: string | null;
  content_type: string | null;
  data_base64: string;
};

type TemplateItem = {
  id: string;
  name: string;
  country_code: string;
  template_content: string;
  is_default: boolean;
};

type ClientItem = {
  id: string;
  name: string;
  sort_order: number;
  emoji: string | null;
};

type StatusItem = {
  id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
  background_color: string | null;
  background_opacity: number | null;
  emoji: string | null;
};

type SourceItem = {
  id: string;
  name: string;
  sort_order: number;
};

type FournisseurItem = {
  id: string;
  name: string;
  sort_order: number;
};

type BankItem = {
  id: string;
  name: string;
  url: string | null;
  bic: string | null;
  logo: BankLogo | null;
};

function trimName(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function asSortOrder(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Math.trunc(Number(value));
  }
  return 0;
}

function parseBackgroundColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s || !/^#[0-9A-Fa-f]{6}$/.test(s)) return null;
  return s;
}

function parseBackgroundOpacity(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

function parseEmoji(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().slice(0, 20);
}

function parseLogo(value: unknown): BankLogo | null {
  if (!value || typeof value !== "object") return null;
  const logo = value as Record<string, unknown>;
  const data = typeof logo.data_base64 === "string" ? logo.data_base64.trim() : "";
  if (!data) return null;
  return {
    filename:
      typeof logo.filename === "string" && logo.filename.trim()
        ? logo.filename.trim().slice(0, 255)
        : null,
    content_type:
      typeof logo.content_type === "string" && logo.content_type.trim()
        ? logo.content_type.trim().slice(0, 100)
        : null,
    data_base64: data,
  };
}

export async function exportCatalog(entity: CatalogEntity): Promise<CatalogExportPayload> {
  const items = await loadExportItems(entity);
  return {
    kind: CATALOG_KIND,
    format_version: CATALOG_FORMAT_VERSION,
    entity,
    exported_at: new Date().toISOString(),
    items,
  };
}

async function loadExportItems(entity: CatalogEntity): Promise<unknown[]> {
  switch (entity) {
    case "templates":
      return exportTemplates();
    case "clients":
      return exportClients();
    case "statuses":
      return exportStatuses();
    case "sources":
      return exportSources();
    case "fournisseurs":
      return exportFournisseurs();
    case "banks":
      return exportBanks();
  }
}

async function exportTemplates(): Promise<TemplateItem[]> {
  const rows = await sql`
    SELECT id, name, country_code, template_content, is_default
    FROM invoice_templates
    WHERE company_id IS NULL
    ORDER BY is_default DESC, name
  `;
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    country_code: String(r.country_code ?? "FR").slice(0, 2).toUpperCase(),
    template_content: typeof r.template_content === "string" ? r.template_content : "",
    is_default: Boolean(r.is_default),
  }));
}

async function exportClients(): Promise<ClientItem[]> {
  const rows = await sql`
    SELECT id, name, sort_order, emoji
    FROM account_types
    ORDER BY sort_order, name
  `;
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    sort_order: asSortOrder(r.sort_order),
    emoji: parseEmoji(r.emoji),
  }));
}

async function exportStatuses(): Promise<StatusItem[]> {
  const rows = await sql`
    SELECT id, name, sort_order, is_default, background_color, background_opacity, emoji
    FROM account_statuses
    ORDER BY sort_order, name
  `;
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    sort_order: asSortOrder(r.sort_order),
    is_default: Boolean(r.is_default),
    background_color: parseBackgroundColor(r.background_color),
    background_opacity: parseBackgroundOpacity(r.background_opacity),
    emoji: parseEmoji(r.emoji),
  }));
}

async function exportSources(): Promise<SourceItem[]> {
  const rows = await sql`
    SELECT id, name, sort_order
    FROM sources
    ORDER BY sort_order, name
  `;
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    sort_order: asSortOrder(r.sort_order),
  }));
}

async function exportFournisseurs(): Promise<FournisseurItem[]> {
  const rows = await sql`
    SELECT id, name, sort_order
    FROM fournisseurs
    ORDER BY sort_order, name
  `;
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    sort_order: asSortOrder(r.sort_order),
  }));
}

async function exportBanks(): Promise<BankItem[]> {
  const rows = await sql`
    SELECT id, name, url, bic
    FROM banks
    ORDER BY name
  `;
  const banks = (Array.isArray(rows) ? rows : [rows]).filter(Boolean);
  const items: BankItem[] = [];
  for (const r of banks) {
    const id = String(r.id);
    const logoRows = await sql`
      SELECT filename, content_type, data_base64
      FROM bank_files
      WHERE bank_id = ${id}::uuid AND file_type = 'logo'
      LIMIT 1
    `;
    const logoRow = Array.isArray(logoRows) ? logoRows[0] : logoRows;
    items.push({
      id,
      name: String(r.name ?? ""),
      url: typeof r.url === "string" && r.url ? r.url : null,
      bic: typeof r.bic === "string" && r.bic ? r.bic : null,
      logo: parseLogo(logoRow ?? null),
    });
  }
  return items;
}

export function parseCatalogPayload(body: unknown): CatalogExportPayload {
  if (!body || typeof body !== "object") {
    throw new CatalogTransferError("Fichier d'import invalide.");
  }
  const payload = body as Record<string, unknown>;
  if (payload.kind !== CATALOG_KIND) {
    throw new CatalogTransferError(
      "Ce fichier n'est pas un export de catalogue BigBoss."
    );
  }
  if (payload.format_version !== CATALOG_FORMAT_VERSION) {
    throw new CatalogTransferError(
      `Version de format non supportée (${String(payload.format_version)}).`
    );
  }
  if (!isCatalogEntity(payload.entity)) {
    throw new CatalogTransferError("Type de catalogue inconnu.");
  }
  if (!Array.isArray(payload.items)) {
    throw new CatalogTransferError("Le fichier ne contient pas de liste d'éléments.");
  }
  return {
    kind: CATALOG_KIND,
    format_version: CATALOG_FORMAT_VERSION,
    entity: payload.entity,
    exported_at:
      typeof payload.exported_at === "string"
        ? payload.exported_at
        : new Date().toISOString(),
    items: payload.items,
  };
}

export async function importCatalog(body: unknown): Promise<CatalogImportResult> {
  const payload = parseCatalogPayload(body);
  switch (payload.entity) {
    case "templates":
      return importTemplates(payload.items);
    case "clients":
      return importClients(payload.items);
    case "statuses":
      return importStatuses(payload.items);
    case "sources":
      return importSources(payload.items);
    case "fournisseurs":
      return importFournisseurs(payload.items);
    case "banks":
      return importBanks(payload.items);
  }
}

function shouldSkip(
  id: string,
  name: string,
  existingIds: Set<string>,
  existingNames: Set<string>
): boolean {
  if (existingIds.has(id)) return true;
  if (existingNames.has(name.toLowerCase())) return true;
  return false;
}

function markInserted(
  id: string,
  name: string,
  existingIds: Set<string>,
  existingNames: Set<string>
) {
  existingIds.add(id);
  existingNames.add(name.toLowerCase());
}

async function importTemplates(items: unknown[]): Promise<CatalogImportResult> {
  const existingRows = await sql`
    SELECT id, name, is_default
    FROM invoice_templates
    WHERE company_id IS NULL
  `;
  const existing = (Array.isArray(existingRows) ? existingRows : [existingRows]).filter(Boolean);
  const existingIds = new Set(existing.map((r) => String(r.id)));
  const existingNames = new Set(
    existing.map((r) => String(r.name ?? "").trim().toLowerCase()).filter(Boolean)
  );
  let hasDefault = existing.some((r) => Boolean(r.is_default));

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
    const name = trimName(item.name, 100);
    if (!name) {
      skipped += 1;
      continue;
    }
    if (shouldSkip(item.id, name, existingIds, existingNames)) {
      skipped += 1;
      continue;
    }

    const countryCode =
      typeof item.country_code === "string" && item.country_code.trim()
        ? item.country_code.trim().slice(0, 2).toUpperCase()
        : "FR";
    const templateContent =
      typeof item.template_content === "string" ? item.template_content : "";
    const wantDefault = Boolean(item.is_default) && !hasDefault;

    await sql`
      INSERT INTO invoice_templates (id, company_id, name, country_code, template_content, is_default)
      VALUES (${item.id}::uuid, NULL, ${name}, ${countryCode}, ${templateContent}, ${wantDefault})
    `;

    markInserted(item.id, name, existingIds, existingNames);
    if (wantDefault) hasDefault = true;
    inserted += 1;
  }

  return { entity: "templates", inserted, skipped };
}

async function importClients(items: unknown[]): Promise<CatalogImportResult> {
  const existingRows = await sql`SELECT id, name FROM account_types`;
  const existing = (Array.isArray(existingRows) ? existingRows : [existingRows]).filter(Boolean);
  const existingIds = new Set(existing.map((r) => String(r.id)));
  const existingNames = new Set(
    existing.map((r) => String(r.name ?? "").trim().toLowerCase()).filter(Boolean)
  );

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
    const name = trimName(item.name, 255);
    if (!name) {
      skipped += 1;
      continue;
    }
    if (shouldSkip(item.id, name, existingIds, existingNames)) {
      skipped += 1;
      continue;
    }

    const sortOrder = asSortOrder(item.sort_order);
    const emoji = parseEmoji(item.emoji);

    await sql`
      INSERT INTO account_types (id, name, sort_order, emoji)
      VALUES (${item.id}::uuid, ${name}, ${sortOrder}, ${emoji})
    `;

    markInserted(item.id, name, existingIds, existingNames);
    inserted += 1;
  }

  return { entity: "clients", inserted, skipped };
}

async function importStatuses(items: unknown[]): Promise<CatalogImportResult> {
  const existingRows = await sql`
    SELECT id, name, is_default
    FROM account_statuses
  `;
  const existing = (Array.isArray(existingRows) ? existingRows : [existingRows]).filter(Boolean);
  const existingIds = new Set(existing.map((r) => String(r.id)));
  const existingNames = new Set(
    existing.map((r) => String(r.name ?? "").trim().toLowerCase()).filter(Boolean)
  );
  let hasDefault = existing.some((r) => Boolean(r.is_default));

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
    const name = trimName(item.name, 255);
    if (!name) {
      skipped += 1;
      continue;
    }
    if (shouldSkip(item.id, name, existingIds, existingNames)) {
      skipped += 1;
      continue;
    }

    const sortOrder = asSortOrder(item.sort_order);
    const wantDefault = Boolean(item.is_default) && !hasDefault;
    const backgroundColor = parseBackgroundColor(item.background_color);
    const backgroundOpacity = parseBackgroundOpacity(item.background_opacity);
    const emoji = parseEmoji(item.emoji);

    await sql`
      INSERT INTO account_statuses (id, name, sort_order, is_default, background_color, background_opacity, emoji)
      VALUES (
        ${item.id}::uuid,
        ${name},
        ${sortOrder},
        ${wantDefault},
        ${backgroundColor},
        ${backgroundOpacity},
        ${emoji}
      )
    `;

    markInserted(item.id, name, existingIds, existingNames);
    if (wantDefault) hasDefault = true;
    inserted += 1;
  }

  return { entity: "statuses", inserted, skipped };
}

async function importSources(items: unknown[]): Promise<CatalogImportResult> {
  const existingRows = await sql`SELECT id, name FROM sources`;
  const existing = (Array.isArray(existingRows) ? existingRows : [existingRows]).filter(Boolean);
  const existingIds = new Set(existing.map((r) => String(r.id)));
  const existingNames = new Set(
    existing.map((r) => String(r.name ?? "").trim().toLowerCase()).filter(Boolean)
  );

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
    const name = trimName(item.name, 255);
    if (!name) {
      skipped += 1;
      continue;
    }
    if (shouldSkip(item.id, name, existingIds, existingNames)) {
      skipped += 1;
      continue;
    }

    const sortOrder = asSortOrder(item.sort_order);

    await sql`
      INSERT INTO sources (id, name, sort_order)
      VALUES (${item.id}::uuid, ${name}, ${sortOrder})
    `;

    markInserted(item.id, name, existingIds, existingNames);
    inserted += 1;
  }

  return { entity: "sources", inserted, skipped };
}

async function importFournisseurs(items: unknown[]): Promise<CatalogImportResult> {
  const existingRows = await sql`SELECT id, name FROM fournisseurs`;
  const existing = (Array.isArray(existingRows) ? existingRows : [existingRows]).filter(Boolean);
  const existingIds = new Set(existing.map((r) => String(r.id)));
  const existingNames = new Set(
    existing.map((r) => String(r.name ?? "").trim().toLowerCase()).filter(Boolean)
  );

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
    const name = trimName(item.name, 255);
    if (!name) {
      skipped += 1;
      continue;
    }
    if (shouldSkip(item.id, name, existingIds, existingNames)) {
      skipped += 1;
      continue;
    }

    const sortOrder = asSortOrder(item.sort_order);

    await sql`
      INSERT INTO fournisseurs (id, name, sort_order)
      VALUES (${item.id}::uuid, ${name}, ${sortOrder})
    `;

    markInserted(item.id, name, existingIds, existingNames);
    inserted += 1;
  }

  return { entity: "fournisseurs", inserted, skipped };
}

async function importBanks(items: unknown[]): Promise<CatalogImportResult> {
  const existingRows = await sql`SELECT id, name FROM banks`;
  const existing = (Array.isArray(existingRows) ? existingRows : [existingRows]).filter(Boolean);
  const existingIds = new Set(existing.map((r) => String(r.id)));
  const existingNames = new Set(
    existing.map((r) => String(r.name ?? "").trim().toLowerCase()).filter(Boolean)
  );

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
    const name = trimName(item.name, 255);
    if (!name) {
      skipped += 1;
      continue;
    }
    if (shouldSkip(item.id, name, existingIds, existingNames)) {
      skipped += 1;
      continue;
    }

    const url =
      typeof item.url === "string" && item.url.trim()
        ? item.url.trim().slice(0, 500)
        : null;
    const bic =
      typeof item.bic === "string" && item.bic.trim()
        ? item.bic.trim().toUpperCase().slice(0, 11)
        : null;

    await sql`
      INSERT INTO banks (id, name, url, bic)
      VALUES (${item.id}::uuid, ${name}, ${url}, ${bic})
    `;

    const logo = parseLogo(item.logo);
    if (logo) {
      await sql`
        INSERT INTO bank_files (bank_id, file_type, filename, content_type, data_base64)
        VALUES (${item.id}::uuid, 'logo', ${logo.filename}, ${logo.content_type}, ${logo.data_base64})
        ON CONFLICT (bank_id, file_type)
        DO UPDATE SET
          filename = EXCLUDED.filename,
          content_type = EXCLUDED.content_type,
          data_base64 = EXCLUDED.data_base64
      `;
    }

    markInserted(item.id, name, existingIds, existingNames);
    inserted += 1;
  }

  return { entity: "banks", inserted, skipped };
}
