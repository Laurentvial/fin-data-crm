import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "node:stream";
import { createGzip } from "node:zlib";
import { sql } from "@/lib/db";

const PAGE_SIZE = 400;

export type S3BackupConfig = {
  bucket: string;
  region: string;
  prefix: string;
  client: S3Client;
};

export function getS3BackupConfig(): S3BackupConfig | null {
  const bucket = process.env.S3_BACKUP_BUCKET?.trim();
  const region =
    process.env.S3_BACKUP_REGION?.trim() || process.env.AWS_REGION?.trim() || "us-east-1";
  if (!bucket) return null;

  const client = new S3Client({ region });
  const prefix = (process.env.S3_BACKUP_PREFIX ?? "database-backups").replace(/^\/+|\/+$/g, "");

  return { bucket, region, prefix, client };
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

export async function runDatabaseBackupToS3(config: S3BackupConfig): Promise<{
  key: string;
  bucket: string;
}> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `${config.prefix}/snapshot-${stamp}.jsonl.gz`;

  const gzip = createGzip({ level: 6 });
  const lineIterator = backupLines();
  const lineStream = Readable.from(
    (async function* () {
      for await (const line of lineIterator) {
        yield line + "\n";
      }
    })()
  );

  lineStream.pipe(gzip);

  const upload = new Upload({
    client: config.client,
    params: {
      Bucket: config.bucket,
      Key: key,
      Body: gzip,
      ContentType: "application/gzip",
      Metadata: {
        "created-at": new Date().toISOString(),
        "backup-format": "bigboss-ndjson-v1",
      },
    },
  });

  await upload.done();

  return { key, bucket: config.bucket };
}
