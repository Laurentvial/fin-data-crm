import { v2 as cloudinary } from "cloudinary";
import { Readable, type Writable } from "node:stream";
import { createGzip } from "node:zlib";
import { configureCloudinary } from "@/lib/invoicing/cloudinary";
import { sql } from "@/lib/db";

/** Neon HTTP driver caps each query response (~64 MiB). Large base64 file columns require small batches + truncation. */
const DEFAULT_BACKUP_PAGE_SIZE = 25;
const MIN_BACKUP_PAGE_SIZE = 1;
const MAX_BACKUP_PAGE_SIZE = 200;
/** Max characters per cell for known heavy text columns (data_base64 logos, etc.). */
const BACKUP_DATA_BASE64_MAX_CHARS = 262_144;
const BACKUP_TEMPLATE_CONTENT_MAX_CHARS = 524_288;

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
      "Export logique NDJSON (gzip). Compatible limite Neon HTTP (~64 Mo par requête) : lots réduits, colonnes bytea exportées en NULL, data_base64 et template_content tronqués. Variable DATABASE_BACKUP_PAGE_SIZE si besoin.",
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

export async function listRecentDatabaseBackups(
  config: CloudinaryBackupConfig
): Promise<{ key: string; size: number; last_modified: string | null }[]> {
  configureCloudinary();
  const prefix = `${config.folder}/`;
  const out = await cloudinary.api.resources({
    resource_type: "raw",
    type: "upload",
    prefix,
    max_results: 40,
  });
  type RawResource = { public_id?: string; bytes?: number; created_at?: string };
  const resources = (Array.isArray(out.resources) ? out.resources : []) as RawResource[];
  return resources
    .filter((r): r is RawResource & { public_id: string } => typeof r.public_id === "string")
    .map((r) => ({
      key: r.public_id,
      size: typeof r.bytes === "number" ? r.bytes : 0,
      last_modified:
        typeof r.created_at === "string"
          ? new Date(r.created_at).toISOString()
          : null,
    }))
    .sort((a, b) => (b.last_modified ?? "").localeCompare(a.last_modified ?? ""));
}

export async function runDatabaseBackupToCloudinary(config: CloudinaryBackupConfig): Promise<{
  key: string;
  public_id: string;
  secure_url: string;
  cloud_name: string;
}> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const publicId = `snapshot-${stamp}`;

  configureCloudinary();

  const gzip = createGzip({ level: 6 });
  const lineIterator = backupLines();
  const lineStream = Readable.from(
    (async function* () {
      try {
        for await (const line of lineIterator) {
          yield line + "\n";
        }
      } finally {
        await lineIterator.return();
      }
    })()
  );

  const result = await new Promise<{
    public_id: string;
    secure_url?: string;
  }>((resolve, reject) => {
    let settled = false;
    let uploadStream!: Writable;

    const destroyPipeline = (cause?: Error) => {
      try {
        lineStream.unpipe(gzip);
      } catch {
        /* ignore */
      }
      try {
        gzip.unpipe(uploadStream);
      } catch {
        /* ignore */
      }
      lineStream.removeAllListeners("error");
      gzip.removeAllListeners("error");
      uploadStream.removeAllListeners("error");
      if (!lineStream.destroyed) {
        lineStream.destroy(cause);
      }
      if (!gzip.destroyed) {
        gzip.destroy(cause);
      }
      if (typeof uploadStream.destroy === "function" && !uploadStream.destroyed) {
        uploadStream.destroy(cause);
      }
    };

    const finish = (err: unknown, res?: { public_id?: string; secure_url?: string }) => {
      if (settled) return;
      settled = true;

      let rejectErr: Error | null = null;
      if (err != null) {
        rejectErr = err instanceof Error ? err : new Error(String(err));
      } else if (!res?.public_id) {
        rejectErr = new Error("Cloudinary n’a pas renvoyé d’identifiant de ressource.");
      }

      destroyPipeline(rejectErr ?? undefined);

      if (rejectErr) {
        reject(rejectErr);
        return;
      }
      resolve({ public_id: res!.public_id!, secure_url: res!.secure_url });
    };

    uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: config.folder,
        public_id: publicId,
        type: "upload",
        unique_filename: false,
        tags: ["database-backup", "bigboss-ndjson-v1"],
      },
      (error, uploadResult) => finish(error, uploadResult ?? undefined)
    ) as Writable;

    const onStreamError = (streamErr: unknown) => finish(streamErr, undefined);
    lineStream.on("error", onStreamError);
    gzip.on("error", onStreamError);
    uploadStream.on("error", onStreamError);

    lineStream.pipe(gzip).pipe(uploadStream);
  });

  return {
    key: result.public_id,
    public_id: result.public_id,
    secure_url: result.secure_url ?? "",
    cloud_name: config.cloudName,
  };
}
