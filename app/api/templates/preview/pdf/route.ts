import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { renderHandlebarsTemplate } from "@/lib/invoicing/render-template";
import { getCountryRules } from "@/lib/invoicing/country-rules";
import { htmlToPdfBuffer } from "@/lib/invoicing/html-to-pdf";

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

const LOGO_PLACEHOLDER =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="48" viewBox="0 0 120 48"><rect width="120" height="48" fill="#1a1a1a" rx="4"/><text x="60" y="30" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">LOGO</text></svg>'
  ).toString("base64");

const SAMPLE_DATA = {
  company: {
    name: "TELLCO",
    address: "48 Rue D'Alesia\n75014 Paris",
    siret: "99942495500014",
    vat_number: "FR27999424955",
    website: "https://groupe-tellco.com/",
    logo_url: LOGO_PLACEHOLDER,
  },
  customer: {
    name: "Client Exemple",
    address: "45 avenue des Champs\n75008 Paris",
    vat: "",
  },
  invoice: {
    number: "FAC-2025-0001",
    issueDate: "2025-01-21",
    dueDate: "2025-02-20",
    subtotal: 4545.45,
    taxAmount: 454.55,
    total: 5000,
    currency: "EUR",
    vatRate: 10,
    isEur: true,
  },
  lineItems: [
    { description: "Prestation de service exemple", quantity: 1, unit_price: 300, vat_rate: 10, amount: 330 },
    { description: "Fourniture et pose", quantity: 1, unit_price: 2450, vat_rate: 10, amount: 2695 },
    { description: "Option supplémentaire", quantity: 1, unit_price: 795.45, vat_rate: 10, amount: 875 },
  ],
  payment: {
    iban: "FR76 1234 5678 9012 3456 7890 123",
    bic: "BNPAFRPP",
  },
};

export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const templateContent =
      typeof body?.template_content === "string" ? body.template_content : "";
    const countryCode =
      typeof body?.country_code === "string"
        ? body.country_code.trim().slice(0, 2).toUpperCase()
        : "FR";

    if (!templateContent) {
      return NextResponse.json(
        { error: "Le contenu du template est requis" },
        { status: 400 }
      );
    }

    const countryRules = getCountryRules(countryCode);
    const data = {
      ...SAMPLE_DATA,
      countryRules: {
        requiredMentions: countryRules.requiredMentions,
        vatLabel: countryRules.vatLabel,
      },
    };

    const html = renderHandlebarsTemplate(templateContent, data);
    const pdfBuffer = await htmlToPdfBuffer(html);

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="apercu-facture.pdf"',
      },
    });
  } catch (error) {
    console.error("POST /api/templates/preview/pdf error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur lors de la prévisualisation",
      },
      { status: 500 }
    );
  }
}
