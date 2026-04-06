import { v2 as cloudinary } from "cloudinary";
import { Readable, type Writable } from "node:stream";
import { createGzip } from "node:zlib";
import { configureCloudinary } from "@/lib/invoicing/cloudinary";
import { sql } from "@/lib/db";

const PAGE_SIZE = 400;

export type CloudinaryBackupConfig = {
  folder: string;
  cloudName: string;
};

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
      "Export logique NDJSON (gzip). Les migrations du dépôt définissent le schéma ; cet export contient surtout les données applicatives.",
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
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = ${schema}
        AND table_name = ${table}
      ORDER BY ordinal_position
    `) as { column_name: string }[];

    const columns = colRows.map((c) => c.column_name);
    yield jsonLine({
      type: "table",
      schema,
      name: table,
      columns,
    });

    let offset = 0;
    for (;;) {
      const rows = (await sql`
        SELECT * FROM ${sql.unsafe(quoted)} LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `) as Record<string, unknown>[];
      if (!rows.length) break;
      yield jsonLine({
        type: "data",
        schema,
        name: table,
        rows,
      });
      offset += rows.length;
      if (rows.length < PAGE_SIZE) break;
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
