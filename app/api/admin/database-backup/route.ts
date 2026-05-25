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

  try {
    const details: Array<{
      key: string;
      deleted_count: number;
      requested_count: number;
      folder_deleted: boolean;
    }> = [];
    let deletedCount = 0;
    let requestedCount = 0;
    let folderDeletedCount = 0;
    for (const key of keys) {
      const result = await deleteDatabaseBackupFromCloudinary(config, key);
      deletedCount += result.deleted_count;
      requestedCount += result.requested_count;
      if (result.folder_deleted) folderDeletedCount += 1;
      details.push({ key, ...result });
    }
    return NextResponse.json({
      ok: true,
      keys,
      deleted_count: deletedCount,
      requested_count: requestedCount,
      folder_deleted_count: folderDeletedCount,
      details,
    });
  } catch (e) {
    console.error("DELETE /api/admin/database-backup:", e);
    const message = e instanceof Error ? e.message : "Échec de la suppression.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
