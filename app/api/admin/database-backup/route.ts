import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import {
  deleteDatabaseBackupFromCloudinary,
  getCloudinaryBackupConfig,
  isNeonSqlResponseTooLargeError,
  listRecentDatabaseBackups,
  runDatabaseBackupToCloudinary,
} from "@/lib/database-cloudinary-backup";

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

  const config = getCloudinaryBackupConfig();
  if (!config) {
    return NextResponse.json({
      configured: false,
      recent: [] as { key: string; size: number; last_modified: string | null }[],
    });
  }

  try {
    const recent = await listRecentDatabaseBackups(config);
    return NextResponse.json({
      configured: true,
      cloud_name: config.cloudName,
      folder: config.folder,
      recent,
    });
  } catch (e) {
    console.error("GET /api/admin/database-backup:", e);
    return NextResponse.json(
      { error: "Impossible de lister les sauvegardes Cloudinary (droits ou configuration)." },
      { status: 500 }
    );
  }
}

export async function POST() {
  const { data: session } = await auth.getSession();
  const err = await requireAdmin(session?.user as { id: string; role?: string } | undefined);
  if (err) return err;

  const config = getCloudinaryBackupConfig();
  if (!config) {
    return NextResponse.json(
      {
        error:
          "Sauvegarde non configurée. Définissez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET (déjà utilisés pour les factures). Optionnel : CLOUDINARY_BACKUP_FOLDER (défaut database-backups).",
      },
      { status: 503 }
    );
  }

  try {
    const { key, public_id, secure_url, cloud_name, part_count } =
      await runDatabaseBackupToCloudinary(config);
    return NextResponse.json({ ok: true, key, public_id, secure_url, cloud_name, part_count });
  } catch (e) {
    console.error("POST /api/admin/database-backup:", e);
    if (isNeonSqlResponseTooLargeError(e)) {
      return NextResponse.json(
        {
          error:
            "Réponse SQL trop volumineuse pour Neon (limite ~64 Mo par requête). Réduisez DATABASE_BACKUP_PAGE_SIZE (ex. 5 ou 10), redémarrez, puis réessayez. Les colonnes bytea sont omises et data_base64 / template_content sont tronqués dans l’export.",
        },
        { status: 507 }
      );
    }
    const message = e instanceof Error ? e.message : "Échec de la sauvegarde.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { data: session } = await auth.getSession();
  const err = await requireAdmin(session?.user as { id: string; role?: string } | undefined);
  if (err) return err;

  const config = getCloudinaryBackupConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Sauvegarde Cloudinary non configurée." },
      { status: 503 }
    );
  }

  let keys: string[];
  try {
    const body = (await req.json()) as { key?: unknown; keys?: unknown };
    if (Array.isArray(body?.keys)) {
      const cleaned = body.keys
        .filter((k): k is string => typeof k === "string")
        .map((k) => k.trim())
        .filter(Boolean);
      if (cleaned.length === 0) {
        return NextResponse.json({ error: "Paramètre keys invalide." }, { status: 400 });
      }
      keys = cleaned;
    } else if (typeof body?.key === "string" && body.key.trim()) {
      keys = [body.key.trim()];
    } else {
      return NextResponse.json({ error: "Paramètre key(s) manquant." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Body JSON invalide." }, { status: 400 });
  }

  const details: Array<{
    key: string;
    ok: boolean;
    deleted_count: number;
    requested_count: number;
    error?: string;
  }> = [];
  let deletedCount = 0;
  let requestedCount = 0;
  const succeededKeys: string[] = [];
  const failedKeys: string[] = [];

  for (const key of keys) {
    try {
      const result = await deleteDatabaseBackupFromCloudinary(config, key);
      deletedCount += result.deleted_count;
      requestedCount += result.requested_count;
      succeededKeys.push(key);
      details.push({ key, ok: true, ...result });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Échec de la suppression.";
      failedKeys.push(key);
      details.push({
        key,
        ok: false,
        deleted_count: 0,
        requested_count: 0,
        error: message,
      });
      console.error(`DELETE /api/admin/database-backup (key=${key}):`, e);
    }
  }

  if (failedKeys.length === 0) {
    return NextResponse.json({
      ok: true,
      partial: false,
      keys,
      succeeded_keys: succeededKeys,
      failed_keys: failedKeys,
      deleted_count: deletedCount,
      requested_count: requestedCount,
      details,
    });
  }

  if (succeededKeys.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        partial: false,
        error:
          failedKeys.length === 1
            ? `Échec de la suppression de ${failedKeys[0]}.`
            : `Échec de la suppression de ${failedKeys.length} sauvegarde(s).`,
        keys,
        succeeded_keys: succeededKeys,
        failed_keys: failedKeys,
        deleted_count: deletedCount,
        requested_count: requestedCount,
        details,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      partial: true,
      error: `Suppression partielle: ${failedKeys.length} sauvegarde(s) en échec.`,
      keys,
      succeeded_keys: succeededKeys,
      failed_keys: failedKeys,
      deleted_count: deletedCount,
      requested_count: requestedCount,
      details,
    },
    { status: 207 }
  );
}
