import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { regenerateInvoice } from "@/lib/invoicing/regenerate-invoice";

async function requireAuth() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Non authentifié. Veuillez vous reconnecter." },
      { status: 401 }
    );
  }
  return null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await params;
    const result = await regenerateInvoice(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("POST /api/invoices/[id]/regenerate error:", error);
    if (message.includes("Facture introuvable")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("Société introuvable")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("Cloudinary")) {
      return NextResponse.json(
        { error: "Erreur lors de l'upload du PDF. Vérifiez la configuration Cloudinary." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: message || "Échec de la régénération de la facture" },
      { status: 500 }
    );
  }
}
