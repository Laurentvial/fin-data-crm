import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { isValidIbanChecksum } from "@/lib/iban-checksum";

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

function extractSwiftAndBankFromIbanTools(data: unknown): {
  valid?: boolean;
  swiftCode: string | null;
  bankName: string | null;
} {
  if (!data || typeof data !== "object") {
    return { swiftCode: null, bankName: null };
  }
  const d = data as Record<string, unknown>;
  const valid = typeof d.valid === "boolean" ? d.valid : undefined;
  let swiftCode: string | null = null;
  let bankName: string | null = null;

  const bank = d.bank;
  if (bank && typeof bank === "object") {
    const b = bank as Record<string, unknown>;
    const raw = b.swift_code ?? b.bic ?? b.swift;
    if (typeof raw === "string" && raw.trim()) {
      swiftCode = raw.trim();
    }
    if (typeof b.name === "string") bankName = b.name;
  }
  if (!swiftCode) {
    const top = d.swift_code ?? d.swift ?? d.bic;
    if (typeof top === "string" && top.trim()) {
      swiftCode = top.trim();
    }
  }
  return { valid, swiftCode, bankName };
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
  let ibantoolsReached = false;

  try {
    const res = await fetch(
      `https://ibantools.org/api/v1/iban/validate/${encodeURIComponent(cleanIban)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "BigBossSystem/1.0",
        },
        cache: "no-store",
      }
    );
    ibantoolsReached = res.ok;
    if (res.ok) {
      const payload = (await res.json()) as unknown;
      const extracted = extractSwiftAndBankFromIbanTools(payload);
      if (typeof extracted.valid === "boolean") {
        valid = extracted.valid;
      }
      if (extracted.swiftCode) {
        swiftCode = extracted.swiftCode;
      }
      if (extracted.bankName) {
        bankName = extracted.bankName;
      }
    }
  } catch {
    ibantoolsReached = false;
  }

  if (!ibantoolsReached) {
    valid = isValidIbanChecksum(cleanIban);
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
