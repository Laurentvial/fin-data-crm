import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

async function requireAuth() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Non authentifié." },
      { status: 401 }
    );
  }
  return null;
}

export async function GET(request: Request) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const iban = searchParams.get("iban");
  if (!iban || typeof iban !== "string") {
    return NextResponse.json(
      { error: "IBAN requis." },
      { status: 400 }
    );
  }

  const cleanIban = iban.trim().replace(/\s/g, "").toUpperCase();
  if (cleanIban.length < 15) {
    return NextResponse.json({ valid: false, swift_code: null });
  }

  let valid = false;
  let swiftCode: string | null = null;
  let bankName: string | null = null;

  try {
    const res = await fetch(
      `https://ibantools.org/api/v1/iban/validate/${encodeURIComponent(cleanIban)}`,
      { headers: { Accept: "application/json" }, cache: "no-store" }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        valid?: boolean;
        bank?: { swift_code?: string; bic?: string; name?: string };
      };
      valid = !!data?.valid;
      const bank = data?.bank;
      const rawBic = bank?.swift_code ?? bank?.bic;
      if (rawBic && typeof rawBic === "string") {
        swiftCode = String(rawBic).trim();
      }
      bankName = bank?.name ?? null;
    }
  } catch {
    // ibantools failed, try fallback
  }

  // Fallback: ibanapi.com when ibantools has no BIC (e.g. TREEZOR) and IBANAPI_API_KEY is set
  if (valid && !swiftCode && process.env.IBANAPI_API_KEY) {
    try {
      const fallbackRes = await fetch(
        `https://api.ibanapi.com/v1/validate/${encodeURIComponent(cleanIban)}?api_key=${process.env.IBANAPI_API_KEY}`,
        { cache: "no-store" }
      );
      if (fallbackRes.ok) {
        const fallbackData = (await fallbackRes.json()) as {
          result?: number;
          data?: { bank?: { bic?: string; bank_name?: string } };
        };
        if (fallbackData?.result === 200 && fallbackData?.data?.bank?.bic) {
          const bic = String(fallbackData.data.bank.bic).trim();
          if (bic) {
            swiftCode = bic;
            bankName = fallbackData.data.bank.bank_name ?? bankName;
          }
        }
      }
    } catch {
      // fallback failed, keep ibantools result
    }
  }

  return NextResponse.json({
    valid,
    swift_code: swiftCode || null,
    bank_name: bankName,
  });
}
