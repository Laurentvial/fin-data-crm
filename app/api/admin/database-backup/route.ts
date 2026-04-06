import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import {
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
    const { key, public_id, secure_url, cloud_name } = await runDatabaseBackupToCloudinary(config);
    return NextResponse.json({ ok: true, key, public_id, secure_url, cloud_name });
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
