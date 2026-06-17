import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { canMutate } from "@/lib/auth/permissions";
import { generateHandlebarsTemplateFromImportedDocument } from "@/lib/invoicing/template-from-import";

export const maxDuration = 120;

const ALLOWED_IMAGE_MIME_PREFIX = "image/";
const ALLOWED_PDF_MIME = "application/pdf";

export async function POST(request: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez vous reconnecter." },
      { status: 401 }
    );
  }
  if (!canMutate(session.user.role)) {
    return NextResponse.json(
      { error: "Accès refusé: rôle lecteur en lecture seule." },
      { status: 403 }
    );
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type multipart/form-data attendu." },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    const countryCodeRaw = form.get("country_code");

    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Fichier image/PDF requis (champ file)." },
        { status: 400 }
      );
    }

    const mime = (file.type || "").trim().toLowerCase();
    const fileName =
      typeof (file as File).name === "string" && (file as File).name
        ? (file as File).name
        : "imported-template";
    const fileNameLc = fileName.toLowerCase();
    const isPdf = mime === ALLOWED_PDF_MIME || fileNameLc.endsWith(".pdf");
    const isImage = mime.startsWith(ALLOWED_IMAGE_MIME_PREFIX);

    if (!isPdf && !isImage) {
      return NextResponse.json(
        { error: "Seuls les fichiers PDF et images sont acceptés." },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const countryCode =
      typeof countryCodeRaw === "string" && countryCodeRaw.trim()
        ? countryCodeRaw.trim().slice(0, 2).toUpperCase()
        : "FR";

    const { templateContent, modelUsed } =
      await generateHandlebarsTemplateFromImportedDocument(
        fileBuffer,
        isPdf ? ALLOWED_PDF_MIME : mime,
        fileName,
        countryCode
      );

    return NextResponse.json({
      template_content: templateContent,
      model_used: modelUsed,
    });
  } catch (error) {
    console.error("POST /api/templates/generate-from-file error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Échec de la génération du template.",
      },
      { status: 500 }
    );
  }
}
