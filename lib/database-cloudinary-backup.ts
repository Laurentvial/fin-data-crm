import { v2 as cloudinary } from "cloudinary";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { configureCloudinary } from "@/lib/invoicing/cloudinary";
import { sql } from "@/lib/db";

const gzipAsync = promisify(gzip);

/** Neon HTTP driver caps each query response (~64 MiB). Large base64 file columns require small batches + truncation. */
const DEFAULT_BACKUP_PAGE_SIZE = 25;
const MIN_BACKUP_PAGE_SIZE = 1;
const MAX_BACKUP_PAGE_SIZE = 200;
/** Max characters per cell for known heavy text columns (data_base64 logos, etc.). */
const BACKUP_DATA_BASE64_MAX_CHARS = 262_144;
const BACKUP_TEMPLATE_CONTENT_MAX_CHARS = 524_288;

/** Free-tier Cloudinary raw uploads are capped at 10 MiB; stay under with a margin. */
const DEFAULT_CLOUDINARY_MAX_PART_BYTES = 9 * 1024 * 1024;
const MIN_CLOUDINARY_MAX_PART_BYTES = 256 * 1024;

function maxCloudinaryPartBytes(): number {
  const raw = process.env.DATABASE_BACKUP_CLOUDINARY_MAX_PART_BYTES;
  if (raw == null || String(raw).trim() === "") return DEFAULT_CLOUDINARY_MAX_PART_BYTES;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) return DEFAULT_CLOUDINARY_MAX_PART_BYTES;
  return Math.min(10 * 1024 * 1024 - 1, Math.max(MIN_CLOUDINARY_MAX_PART_BYTES, n));
}

/** Target uncompressed batch size before gzipping (reduces how often we split). */
const BACKUP_MULTIPART_BATCH_UNCOMPRESSED = 5 * 1024 * 1024;

function backupPageSize(): number {
  const raw = process.env.DATABASE_BACKUP_PAGE_SIZE;
  if (raw == null || String(raw).trim() === "") return DEFAULT_BACKUP_PAGE_SIZE;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) return DEFAULT_BACKUP_PAGE_SIZE;
  return Math.min(MAX_BACKUP_PAGE_SIZE, Math.max(MIN_BACKUP_PAGE_SIZE, n));
}

function pgQuoteIdent(name: string, kind: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Identifiant ${kind} refusé pour l'export : ${name}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/** Cloudinary callbacks often pass a plain object, not an Error — avoid new Error(String(obj)) → "[object Object]". */
function unknownUploadErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) return o.message;
    if (typeof o.error === "string" && o.error.trim()) return o.error;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "Erreur d’upload Cloudinary inconnue.";
  }
}

type ColumnMeta = { column_name: string; data_type: string; udt_name: string };

/** SELECT list that keeps rows under Neon’s per-response size limit (bytea omitted, large text truncated). */
function buildBackupSelectExpressions(columns: ColumnMeta[]): string {
  if (columns.length === 0) {
    throw new Error("Table sans colonnes : export impossible.");
  }
  return columns
    .map((c) => {
      const q = pgQuoteIdent(c.column_name, "colonne");
      if (c.udt_name === "bytea") {
        return `NULL AS ${q}`;
      }
      const low = c.column_name.toLowerCase();
      if (low === "data_base64") {
        return `(CASE WHEN ${q} IS NULL THEN NULL ELSE LEFT(${q}::text, ${BACKUP_DATA_BASE64_MAX_CHARS}) END) AS ${q}`;
      }
      if (low === "template_content") {
        return `(CASE WHEN ${q} IS NULL THEN NULL ELSE LEFT(${q}::text, ${BACKUP_TEMPLATE_CONTENT_MAX_CHARS}) END) AS ${q}`;
      }
      return q;
    })
    .join(", ");
}

export type CloudinaryBackupConfig = {
  folder: string;
  cloudName: string;
};

/** Neon HTTP SQL can return 507 when a single query response exceeds ~64 MiB. */
export function isNeonSqlResponseTooLargeError(err: unknown): boolean {
  const chunks: string[] = [];
  if (err instanceof Error) chunks.push(err.message);
  if (err && typeof err === "object") {
    const m = (err as { message?: unknown }).message;
    if (m != null) chunks.push(String(m));
  }
  try {
    chunks.push(JSON.stringify(err));
  } catch {
    /* ignore */
  }
  const s = chunks.join(" ");
  return s.includes("response is too large") || s.includes("67108864");
}

export function getCloudinaryBackupConfig(): CloudinaryBackupConfig | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) return null;

  const folder = (process.env.CLOUDINARY_BACKUP_FOLDER ?? "database-backups").replace(/^\/+|\/+$/g, "");
  return { folder, cloudName };
}

function isSafeIdentPart(s: string): boolean {
  return /^[a-z_][a-z0-9_]*$/i.test(s);
}

function quoteTableRef(schema: string, table: string): string {
  if (!isSafeIdentPart(schema) || !isSafeIdentPart(table)) {
    throw new Error(`Identifiant de table refusé: ${schema}.${table}`);
  }
  return `"${schema}"."${table}"`;
}

function jsonLine(obj: unknown): string {
  return JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

type TableRef = { table_schema: string; table_name: string };

async function* backupLines(): AsyncGenerator<string, void, undefined> {
  const meta = {
    type: "meta" as const,
    format_version: 1,
    created_at: new Date().toISOString(),
    note:
      "Export logique NDJSON (plusieurs fichiers gzip si Cloudinary : chaque part-*.gz autonome, concaténer les flux décompressés dans l’ordre). Limite Neon HTTP (~64 Mo/requête) : lots réduits, bytea → NULL, data_base64 et template_content tronqués. DATABASE_BACKUP_PAGE_SIZE si besoin.",
    backup_page_size: backupPageSize(),
  };
  yield jsonLine(meta);

  const tables = (await sql`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name
  `) as TableRef[];

  for (const t of tables) {
    const { table_schema: schema, table_name: table } = t;
    const quoted = quoteTableRef(schema, table);

    const colRows = (await sql`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = ${schema}
        AND table_name = ${table}
      ORDER BY ordinal_position
    `) as ColumnMeta[];

    const columns = colRows.map((c) => c.column_name);
    const selectList = buildBackupSelectExpressions(colRows);
    yield jsonLine({
      type: "table",
      schema,
      name: table,
      columns,
    });

    const pageSize = backupPageSize();
    let offset = 0;
    for (;;) {
      const rows = (await sql.query(
        `SELECT ${selectList} FROM ${quoted} LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      )) as Record<string, unknown>[];
      if (!rows.length) break;
      yield jsonLine({
        type: "data",
        schema,
        name: table,
        rows,
      });
      offset += rows.length;
      if (rows.length < pageSize) break;
    }
  }
}

export type BackupListItem = {
  key: string;
  size: number;
  last_modified: string | null;
  /** Nombre de ressources Cloudinary (segments part-XXX + manifest pour le format actuel ; 1 pour un ancien fichier unique). */
  parts?: number;
};

const CLOUDINARY_DELETE_CHUNK_SIZE = 100;

function groupKeyFromBackupPublicId(publicId: string): {
  groupKey: string;
  isDataPart: boolean;
} {
  if (publicId.endsWith("/manifest")) {
    return { groupKey: publicId.slice(0, -"/manifest".length), isDataPart: false };
  }
  const m = publicId.match(/^(.*)\/part-\d{3}$/);
  if (m) return { groupKey: m[1], isDataPart: true };
  return { groupKey: publicId, isDataPart: false };
}

function maxIsoDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

export async function listRecentDatabaseBackups(config: CloudinaryBackupConfig): Promise<BackupListItem[]> {
  configureCloudinary();
  const prefix = `${config.folder}/`;
  type RawResource = { public_id?: string; bytes?: number; created_at?: string };
  type CloudinaryResourcesPage = { resources?: RawResource[]; next_cursor?: string };
  const resources: RawResource[] = [];
  let nextCursor: string | undefined;
  let pageCount = 0;
  const MAX_PAGES = 50;

  do {
    const out = (await cloudinary.api.resources({
      resource_type: "raw",
      type: "upload",
      prefix,
      max_results: 500,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    })) as CloudinaryResourcesPage;

    if (Array.isArray(out.resources) && out.resources.length > 0) {
      resources.push(...out.resources);
    }
    nextCursor = typeof out.next_cursor === "string" && out.next_cursor.trim() ? out.next_cursor : undefined;
    pageCount += 1;
  } while (nextCursor && pageCount < MAX_PAGES);

  const rows = resources.filter(
    (r): r is RawResource & { public_id: string } => typeof r.public_id === "string"
  );

  const grouped = new Map<
    string,
    { size: number; last_modified: string | null; parts: number; legacyFile: boolean }
  >();

  for (const r of rows) {
    const { groupKey, isDataPart } = groupKeyFromBackupPublicId(r.public_id);
    const prev = grouped.get(groupKey) ?? {
      size: 0,
      last_modified: null,
      parts: 0,
      legacyFile: false,
    };
    const created =
      typeof r.created_at === "string" ? new Date(r.created_at).toISOString() : null;
    prev.size += typeof r.bytes === "number" ? r.bytes : 0;
    prev.last_modified = maxIsoDate(prev.last_modified, created);
    if (isDataPart) prev.parts += 1;
    else if (!r.public_id.endsWith("/manifest")) prev.legacyFile = true;
    grouped.set(groupKey, prev);
  }

  const list: BackupListItem[] = [];
  for (const [key, g] of grouped) {
    const item: BackupListItem = {
      key,
      size: g.size,
      last_modified: g.last_modified,
    };
    if (g.parts > 0) item.parts = g.parts + 1;
    else if (g.legacyFile) item.parts = 1;
    list.push(item);
  }

  return list.sort((a, b) => (b.last_modified ?? "").localeCompare(a.last_modified ?? ""));
}

function assertBackupKeyInFolder(config: CloudinaryBackupConfig, key: string): string {
  const normalized = String(key ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!normalized) {
    throw new Error("Identifiant de sauvegarde manquant.");
  }
  const folderPrefix = `${config.folder}/`;
  if (!normalized.startsWith(folderPrefix)) {
    throw new Error("Identifiant de sauvegarde invalide pour ce dossier Cloudinary.");
  }
  const tail = normalized.slice(folderPrefix.length);
  // Safety rail: only allow deleting one snapshot key directly under backup folder.
  // This prevents accidental parent-folder deletions.
  if (!tail || tail.includes("/")) {
    throw new Error("Identifiant de sauvegarde invalide (niveau de dossier refusé).");
  }
  return normalized;
}

async function listCloudinaryRawResourceIdsByPrefix(prefix: string): Promise<string[]> {
  type RawResource = { public_id?: string };
  type CloudinaryResourcesPage = { resources?: RawResource[]; next_cursor?: string };
  const ids: string[] = [];
  let nextCursor: string | undefined;
  let pageCount = 0;
  const MAX_PAGES = 50;

  do {
    const out = (await cloudinary.api.resources({
      resource_type: "raw",
      type: "upload",
      prefix,
      max_results: 500,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    })) as CloudinaryResourcesPage;
    if (Array.isArray(out.resources)) {
      for (const r of out.resources) {
        if (typeof r.public_id === "string" && r.public_id.trim()) {
          ids.push(r.public_id);
        }
      }
    }
    nextCursor = typeof out.next_cursor === "string" && out.next_cursor.trim() ? out.next_cursor : undefined;
    pageCount += 1;
  } while (nextCursor && pageCount < MAX_PAGES);

  return ids;
}

export async function deleteDatabaseBackupFromCloudinary(
  config: CloudinaryBackupConfig,
  key: string
): Promise<{ deleted_count: number; requested_count: number }> {
  configureCloudinary();
  const safeKey = assertBackupKeyInFolder(config, key);
  const allMatchingPrefix = await listCloudinaryRawResourceIdsByPrefix(safeKey);
  const ids = allMatchingPrefix.filter((id) => id === safeKey || id.startsWith(`${safeKey}/`));
  if (ids.length === 0) {
    return { deleted_count: 0, requested_count: 0 };
  }
  let deletedCount = 0;
  for (let i = 0; i < ids.length; i += CLOUDINARY_DELETE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CLOUDINARY_DELETE_CHUNK_SIZE);
    const out = (await cloudinary.api.delete_resources(chunk, {
      resource_type: "raw",
      type: "upload",
    })) as { deleted?: Record<string, string> };
    if (out && out.deleted && typeof out.deleted === "object") {
      for (const v of Object.values(out.deleted)) {
        if (v === "deleted") deletedCount += 1;
      }
    }
  }
  return { deleted_count: deletedCount, requested_count: ids.length };
}

async function uploadRawBuffer(
  config: CloudinaryBackupConfig,
  publicId: string,
  buffer: Buffer,
  extraTags: string[] = [],
  folderOverride?: string,
): Promise<{ public_id: string; secure_url?: string }> {
  configureCloudinary();
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: folderOverride ?? config.folder,
        public_id: publicId,
        type: "upload",
        unique_filename: false,
        tags: [
          "database-backup",
          "bigboss-ndjson-v1",
          ...extraTags,
        ],
      },
      (error, result) => {
        if (error != null) {
          reject(error instanceof Error ? error : new Error(unknownUploadErrorMessage(error)));
          return;
        }
        if (!result?.public_id) {
          reject(new Error("Cloudinary n’a pas renvoyé d’identifiant de ressource."));
          return;
        }
        resolve({ public_id: result.public_id, secure_url: result.secure_url });
      },
    );
    Readable.from(buffer).pipe(uploadStream);
  });
}

async function uploadGzippedLinesChunk(
  lines: string[],
  config: CloudinaryBackupConfig,
  runFolder: string,
  maxBytes: number,
  partCounter: { n: number },
): Promise<void> {
  if (lines.length === 0) return;
  const body = `${lines.join("\n")}\n`;
  const gz = await gzipAsync(Buffer.from(body, "utf8"), { level: 6 });
  const buf = Buffer.from(gz);
  if (buf.length <= maxBytes) {
    const idx = partCounter.n;
    partCounter.n += 1;
    await uploadRawBuffer(
      config,
      `part-${String(idx).padStart(3, "0")}`,
      buf,
      ["bigboss-ndjson-multipart"],
      runFolder,
    );
    return;
  }
  if (lines.length === 1) {
    throw new Error(
      `Un fragment d’export dépasse la taille max par fichier Cloudinary (${maxBytes} o après gzip). Réduisez DATABASE_BACKUP_PAGE_SIZE et réessayez.`,
    );
  }
  const mid = Math.floor(lines.length / 2);
  await uploadGzippedLinesChunk(lines.slice(0, mid), config, runFolder, maxBytes, partCounter);
  await uploadGzippedLinesChunk(lines.slice(mid), config, runFolder, maxBytes, partCounter);
}

export async function runDatabaseBackupToCloudinary(config: CloudinaryBackupConfig): Promise<{
  key: string;
  public_id: string;
  secure_url: string;
  cloud_name: string;
  part_count: number;
}> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  // Ensure each run gets a dedicated Cloudinary subfolder even if backups start very close together.
  const runId = randomUUID().slice(0, 8);
  const basePublicId = `snapshot-${stamp}-${runId}`;
  const runFolder = `${config.folder}/${basePublicId}`;
  const maxPart = maxCloudinaryPartBytes();
  const partCounter = { n: 0 };

  const lineIterator = backupLines();
  let batch: string[] = [];
  let batchUnc = 0;

  try {
    for await (const line of lineIterator) {
      const lineB = Buffer.byteLength(`${line}\n`, "utf8");
      if (
        batchUnc + lineB > BACKUP_MULTIPART_BATCH_UNCOMPRESSED &&
        batch.length > 0
      ) {
        await uploadGzippedLinesChunk(batch, config, runFolder, maxPart, partCounter);
        batch = [];
        batchUnc = 0;
      }
      batch.push(line);
      batchUnc += lineB;
    }
    if (batch.length > 0) {
      await uploadGzippedLinesChunk(batch, config, runFolder, maxPart, partCounter);
    }
  } finally {
    await lineIterator.return();
  }

  if (partCounter.n === 0) {
    throw new Error("Export vide : aucune donnée à envoyer.");
  }

  const fullBaseId = `${config.folder}/${basePublicId}`;
  const manifest = {
    format: "bigboss-ndjson-gzip-multipart-v1" as const,
    base_public_id: fullBaseId,
    part_count: partCounter.n,
    max_part_bytes: maxPart,
    created_at: new Date().toISOString(),
    restore:
      "Télécharger tous les segments part-000 … dans l’ordre ; concaténer les sorties de gunzip -c (chaque fichier est un gzip autonome) pour obtenir le NDJSON complet.",
  };
  const manifestBody = Buffer.from(`${JSON.stringify(manifest, null, 0)}\n`, "utf8");
  const manifestRes = await uploadRawBuffer(config, "manifest", manifestBody, [
    "bigboss-ndjson-multipart",
    "bigboss-backup-manifest",
  ], runFolder);

  return {
    key: fullBaseId,
    public_id: fullBaseId,
    secure_url: manifestRes.secure_url ?? "",
    cloud_name: config.cloudName,
    part_count: partCounter.n,
  };
}
