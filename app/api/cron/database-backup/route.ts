import { NextRequest, NextResponse } from "next/server";
import {
  getCloudinaryBackupConfig,
  isNeonSqlResponseTooLargeError,
  runDatabaseBackupToCloudinary,
} from "@/lib/database-cloudinary-backup";

export const maxDuration = 300;

function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
}

function hasValidCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const authz = req.headers.get("authorization");
  return authz === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!hasValidCronSecret(req)) {
    return unauthorizedResponse();
  }

  const config = getCloudinaryBackupConfig();
  if (!config) {
    return NextResponse.json(
      {
        error:
          "Sauvegarde non configurée. Définissez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET.",
      },
      { status: 503 },
    );
  }

  try {
    const { key, public_id, secure_url, cloud_name, part_count } =
      await runDatabaseBackupToCloudinary(config);
    return NextResponse.json({
      ok: true,
      source: "cron",
      key,
      public_id,
      secure_url,
      cloud_name,
      part_count,
    });
  } catch (e) {
    console.error("GET /api/cron/database-backup:", e);
    if (isNeonSqlResponseTooLargeError(e)) {
      return NextResponse.json(
        {
          error:
            "Réponse SQL trop volumineuse pour Neon (~64 Mo/requête). Réduisez DATABASE_BACKUP_PAGE_SIZE puis réessayez.",
        },
        { status: 507 },
      );
    }
    const message = e instanceof Error ? e.message : "Échec de la sauvegarde.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
