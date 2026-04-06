import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getS3BackupConfig, runDatabaseBackupToS3 } from "@/lib/database-s3-backup";

export const maxDuration = 300;

async function requireAdmin(sessionUser: { id: string; role?: string } | undefined) {
  if (!sessionUser) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  if (sessionUser.role !== "admin") {
    return NextResponse.json(
      { error: "Accès réservé aux administrateurs." },
      { status: 403 }
    );
  }
  return null;
}

export async function GET() {
  const { data: session } = await auth.getSession();
  const err = await requireAdmin(session?.user as { id: string; role?: string } | undefined);
  if (err) return err;

  const config = getS3BackupConfig();
  if (!config) {
    return NextResponse.json({
      configured: false,
      recent: [] as { key: string; size: number; last_modified: string | null }[],
    });
  }

  try {
    const out = await config.client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: `${config.prefix}/`,
        MaxKeys: 40,
      })
    );
    const contents = out.Contents ?? [];
    const recent = contents
      .filter((o): o is typeof o & { Key: string } => typeof o.Key === "string")
      .map((o) => ({
        key: o.Key,
        size: o.Size ?? 0,
        last_modified: o.LastModified?.toISOString() ?? null,
      }))
      .sort((a, b) => (b.last_modified ?? "").localeCompare(a.last_modified ?? ""));
    return NextResponse.json({ configured: true, bucket: config.bucket, recent });
  } catch (e) {
    console.error("GET /api/admin/database-backup:", e);
    return NextResponse.json(
      { error: "Impossible de lister les sauvegardes S3 (droits ou configuration)." },
      { status: 500 }
    );
  }
}

export async function POST() {
  const { data: session } = await auth.getSession();
  const err = await requireAdmin(session?.user as { id: string; role?: string } | undefined);
  if (err) return err;

  const config = getS3BackupConfig();
  if (!config) {
    return NextResponse.json(
      {
        error:
          "Sauvegarde S3 non configurée. Définissez S3_BACKUP_BUCKET, AWS_ACCESS_KEY_ID et AWS_SECRET_ACCESS_KEY (et optionnellement S3_BACKUP_REGION ou AWS_REGION, S3_BACKUP_PREFIX).",
      },
      { status: 503 }
    );
  }

  try {
    const { key, bucket } = await runDatabaseBackupToS3(config);
    return NextResponse.json({ ok: true, key, bucket });
  } catch (e) {
    console.error("POST /api/admin/database-backup:", e);
    const message = e instanceof Error ? e.message : "Échec de la sauvegarde.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
