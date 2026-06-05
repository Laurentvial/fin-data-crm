import {
  BlockReason,
  FinishReason,
  GoogleGenerativeAI,
  SchemaType,
  type GenerateContentResult,
  type ObjectSchema,
} from "@google/generative-ai";
import type { TransactionType } from "@/lib/types";

const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_CSV_BYTES = 5 * 1024 * 1024;

/** Relevés longs : 16k jetons de sortie coupent souvent le JSON au milieu. Les modèles récents acceptent beaucoup plus. */
const DEFAULT_STATEMENT_MAX_OUTPUT_TOKENS = 65_536;
const MIN_STATEMENT_MAX_OUTPUT_TOKENS = 8_192;
const CAP_STATEMENT_MAX_OUTPUT_TOKENS = 1_048_576;

function statementMaxOutputTokens(): number {
  const raw = process.env.GEMINI_STATEMENT_MAX_OUTPUT_TOKENS;
  if (raw == null || String(raw).trim() === "") return DEFAULT_STATEMENT_MAX_OUTPUT_TOKENS;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < MIN_STATEMENT_MAX_OUTPUT_TOKENS) {
    return DEFAULT_STATEMENT_MAX_OUTPUT_TOKENS;
  }
  return Math.min(n, CAP_STATEMENT_MAX_OUTPUT_TOKENS);
}

function stripMarkdownJsonFence(raw: string): string {
  let s = raw.trim();
  const m = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/im.exec(s);
  if (m) return m[1]!.trim();
  return s;
}

export interface NormalizedExtractedLine {
  transaction_date: string;
  amount: number;
  description: string;
  type: TransactionType;
}

export interface CsvColumnMapping {
  date: string;
  description?: string;
  amount?: string;
  debit?: string;
  credit?: string;
  type?: string;
}

interface CsvExtractOptions {
  mapping?: CsvColumnMapping;
}

const LINE_ITEM_SCHEMA: ObjectSchema = {
  type: SchemaType.OBJECT,
  properties: {
    transaction_date: {
      type: SchemaType.STRING,
      description: "Date in YYYY-MM-DD",
    },
    amount: {
      type: SchemaType.NUMBER,
      description: "Strictly positive amount in account currency",
    },
    description: { type: SchemaType.STRING },
    type: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["DEBIT", "CREDIT"],
    },
  },
  required: ["transaction_date", "amount", "description", "type"],
};

const RESPONSE_SCHEMA: ObjectSchema = {
  type: SchemaType.OBJECT,
  properties: {
    transactions: {
      type: SchemaType.ARRAY,
      items: LINE_ITEM_SCHEMA,
    },
  },
  required: ["transactions"],
};

function isValidISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
}

export function assertPdfBuffer(buf: Buffer): void {
  if (buf.length === 0) {
    throw new Error("Le fichier PDF est vide.");
  }
  if (buf.length > MAX_PDF_BYTES) {
    throw new Error(`Le PDF dépasse la taille maximale (${Math.floor(MAX_PDF_BYTES / (1024 * 1024))} Mo).`);
  }
  const head = buf.subarray(0, 5).toString("utf8");
  if (!head.startsWith("%PDF")) {
    throw new Error("Le fichier ne semble pas être un PDF valide.");
  }
}

export function assertCsvBuffer(buf: Buffer): void {
  if (buf.length === 0) {
    throw new Error("Le fichier CSV est vide.");
  }
  if (buf.length > MAX_CSV_BYTES) {
    throw new Error(`Le CSV dépasse la taille maximale (${Math.floor(MAX_CSV_BYTES / (1024 * 1024))} Mo).`);
  }
}

function normalizeHeader(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  while (i < raw.length) {
    const ch = raw[i]!;
    const next = raw[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i += 1;
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }

    cell += ch;
    i += 1;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function splitCsvWithDelimiter(row: string[], delimiter: string): string[] {
  const source = row.join("\n");
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

function detectCsvDelimiter(firstLine: string): string {
  const candidates = [";", ",", "\t"];
  let best = ";";
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

function parseAmount(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  const negative = v.includes("(") || /^-/.test(v);
  const cleaned = v
    .replace(/\s/g, "")
    .replace(/[€$£]/g, "")
    .replace(/[()]/g, "")
    .replace(/,/g, ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const signed = negative ? -Math.abs(n) : n;
  return Math.round(signed * 100) / 100;
}

function parseDateToIso(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const dateOnly = value
    .replace("T", " ")
    .split(" ")[0]
    ?.trim();
  if (!dateOnly) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return isValidISODate(dateOnly) ? dateOnly : null;

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateOnly);
  if (slash) {
    const d = Number(slash[1]);
    const m = Number(slash[2]);
    const y = Number(slash[3]);
    const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return isValidISODate(iso) ? iso : null;
  }

  const dash = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(dateOnly);
  if (dash) {
    const d = Number(dash[1]);
    const m = Number(dash[2]);
    const y = Number(dash[3]);
    const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return isValidISODate(iso) ? iso : null;
  }

  return null;
}

function parseType(raw: string): TransactionType | null {
  const t = normalizeHeader(raw);
  if (!t) return null;
  if (["credit", "crediteur", "versement", "entree", "in"].includes(t)) return "CREDIT";
  if (["debit", "debiteur", "prelevement", "sortie", "out"].includes(t)) return "DEBIT";
  return null;
}

export async function extractTransactionsFromCsvBuffer(
  csvBuffer: Buffer,
  options?: CsvExtractOptions
): Promise<NormalizedExtractedLine[]> {
  assertCsvBuffer(csvBuffer);
  const text = csvBuffer.toString("utf8").replace(/^\uFEFF/, "").trim();
  if (!text) return [];

  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const baseRows = parseCsvRows(text);
  const toRows = (delimiter: string) =>
    baseRows
      .map((r) => splitCsvWithDelimiter(r, delimiter))
      .map((r) => r.map((c) => c.trim()))
      .filter((r) => r.some((c) => c.length > 0));

  const mapping = options?.mapping;
  const requestedDateHeader = normalizeHeader(mapping?.date ?? "");
  const delimiterCandidates = [detectCsvDelimiter(firstLine), ";", ",", "\t"].filter(
    (v, idx, arr) => arr.indexOf(v) === idx
  );

  let rows: string[][] = [];
  for (const candidate of delimiterCandidates) {
    const candidateRows = toRows(candidate);
    if (candidateRows.length === 0) continue;
    if (!requestedDateHeader) {
      rows = candidateRows;
      break;
    }
    const candidateHeaders = candidateRows[0]!.map((h) => normalizeHeader(h));
    if (candidateHeaders.includes(requestedDateHeader)) {
      rows = candidateRows;
      break;
    }
    if (rows.length === 0) rows = candidateRows;
  }

  rows = rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c.length > 0));

  if (rows.length === 0) return [];

  const headers = rows[0]!.map((h) => normalizeHeader(h));
  const findCol = (...names: string[]) => headers.findIndex((h) => names.includes(h));

  const indexByMappedHeader = (value?: string): number => {
    if (!value) return -1;
    const normalized = normalizeHeader(value);
    if (!normalized) return -1;
    return headers.findIndex((h) => h === normalized);
  };

  const mappedDate = indexByMappedHeader(mapping?.date);
  const mappedDescription = indexByMappedHeader(mapping?.description);
  const mappedAmount = indexByMappedHeader(mapping?.amount);
  const mappedDebit = indexByMappedHeader(mapping?.debit);
  const mappedCredit = indexByMappedHeader(mapping?.credit);
  const mappedType = indexByMappedHeader(mapping?.type);

  const idxDate = mappedDate >= 0 ? mappedDate : findCol("date", "dateoperation", "datevaleur", "transactiondate");
  const idxAmount = mappedAmount >= 0 ? mappedAmount : findCol("montant", "amount", "valeur");
  const idxDebit = mappedDebit >= 0 ? mappedDebit : findCol("debit");
  const idxCredit = mappedCredit >= 0 ? mappedCredit : findCol("credit");
  const idxDescription =
    mappedDescription >= 0
      ? mappedDescription
      : findCol("libelle", "description", "label", "memo", "details", "operation");
  const idxType = mappedType >= 0 ? mappedType : findCol("type", "sens", "nature", "transactiontype");

  if (mapping?.date && mappedDate < 0) {
    throw new Error(`Colonne date introuvable dans le CSV: "${mapping.date}"`);
  }
  if (mapping?.amount && mappedAmount < 0) {
    throw new Error(`Colonne montant introuvable dans le CSV: "${mapping.amount}"`);
  }
  if (mapping?.debit && mappedDebit < 0) {
    throw new Error(`Colonne débit introuvable dans le CSV: "${mapping.debit}"`);
  }
  if (mapping?.credit && mappedCredit < 0) {
    throw new Error(`Colonne crédit introuvable dans le CSV: "${mapping.credit}"`);
  }
  if (mapping?.description && mappedDescription < 0) {
    throw new Error(`Colonne libellé introuvable dans le CSV: "${mapping.description}"`);
  }
  if (mapping?.type && mappedType < 0) {
    throw new Error(`Colonne type introuvable dans le CSV: "${mapping.type}"`);
  }
  if (idxDate < 0) {
    throw new Error("Aucune colonne date détectée. Choisissez-la manuellement.");
  }
  if (idxAmount < 0 && idxDebit < 0 && idxCredit < 0) {
    throw new Error("Aucune colonne montant détectée. Choisissez montant ou débit/crédit.");
  }

  const hasHeader = mapping != null || (idxDate >= 0 && (idxAmount >= 0 || idxDebit >= 0 || idxCredit >= 0));
  const startIndex = hasHeader ? 1 : 0;
  const out: NormalizedExtractedLine[] = [];

  for (let i = startIndex; i < rows.length; i += 1) {
    const row = rows[i]!;

    const rawDate = idxDate >= 0 ? row[idxDate] ?? "" : row[0] ?? "";
    const transactionDate = parseDateToIso(rawDate);
    if (!transactionDate) continue;

    let signedAmount: number | null = null;
    let type: TransactionType | null = null;

    if (idxDebit >= 0 || idxCredit >= 0) {
      const debit = idxDebit >= 0 ? parseAmount(row[idxDebit] ?? "") : null;
      const credit = idxCredit >= 0 ? parseAmount(row[idxCredit] ?? "") : null;
      if (credit != null && Math.abs(credit) > 0) {
        signedAmount = Math.abs(credit);
        type = "CREDIT";
      } else if (debit != null && Math.abs(debit) > 0) {
        signedAmount = -Math.abs(debit);
        type = "DEBIT";
      }
    } else {
      const rawAmount = idxAmount >= 0 ? row[idxAmount] ?? "" : row[2] ?? "";
      signedAmount = parseAmount(rawAmount);
    }

    if (signedAmount == null || !Number.isFinite(signedAmount) || signedAmount === 0) continue;

    const parsedType =
      idxType >= 0 ? parseType(row[idxType] ?? "") : null;
    if (parsedType) {
      type = parsedType;
      signedAmount = Math.abs(signedAmount) * (type === "DEBIT" ? -1 : 1);
    } else if (!type) {
      type = signedAmount < 0 ? "DEBIT" : "CREDIT";
    }

    const desc =
      (idxDescription >= 0 ? row[idxDescription] : row[1])?.trim() || "";
    out.push({
      transaction_date: transactionDate,
      amount: Math.round(Math.abs(signedAmount) * 100) / 100,
      description: desc,
      type,
    });
  }

  return out;
}

function normalizeLines(raw: unknown[]): NormalizedExtractedLine[] {
  const out: NormalizedExtractedLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const date = typeof r.transaction_date === "string" ? r.transaction_date.trim() : "";
    const desc = typeof r.description === "string" ? r.description.trim() : "";
    const typ = r.type === "CREDIT" || r.type === "DEBIT" ? r.type : null;
    const amt = typeof r.amount === "number" ? r.amount : Number(r.amount);
    if (!typ || !isValidISODate(date) || !Number.isFinite(amt) || amt <= 0) continue;
    out.push({
      transaction_date: date,
      amount: Math.round(amt * 100) / 100,
      description: desc,
      type: typ,
    });
  }
  return out;
}

const SYSTEM_INSTRUCTIONS = `Tu extrais les mouvements (opérations) d'un relevé bancaire PDF.
Règles:
- Uniquement les lignes de transactions réelles (virements, cartes, prélèvements, agios, chèques encaissés, etc.).
- Ne pas inclure: soldes intermédiaires, totaux de page, en-têtes, ni ligne unique "solde initial/final" sans mouvement.
- amount: nombre strictement positif dans la devise du compte; si le relevé indique un débit entre parenthèses ou signe négatif, c'est DEBIT avec amount positif.
- DEBIT: sortie d'argent / débit. CREDIT: entrée d'argent / crédit interne banque.
- Formats de montants français (virgule décimale, espaces) : convertis en nombre.
- transaction_date au format ISO YYYY-MM-DD (date d'opération ou de valeur selon le libellé du relevé; si une seule date par ligne, l'utiliser).
- description: libellé brut de la ligne, sans inventer d'informations.`;

/** Trim, strip UTF-8 BOM, remove wrapping quotes (common .env mistakes). */
function normalizeEnvSecret(raw: string): string {
  let s = raw.replace(/^\uFEFF/, "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function geminiApiKey(): string {
  const raw =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    "";
  const key = normalizeEnvSecret(raw);
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY n'est pas configurée sur le serveur (ou ajoutez GOOGLE_GENERATIVE_AI_API_KEY)."
    );
  }
  return key;
}

function isGeminiApiKeyInvalidMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("api_key_invalid") ||
    m.includes("api key not valid") ||
    m.includes("please pass a valid api key")
  );
}

function isGeminiModelNotFoundMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("404") ||
    m.includes("not found") ||
    m.includes("is not found for api version") ||
    m.includes("not supported for generatecontent") ||
    m.includes("listmodels")
  );
}

/**
 * Sans GEMINI_STATEMENT_MODEL : premier essai = gemini-3-flash-preview, puis chaîne de secours.
 * Cf. https://ai.google.dev/gemini-api/docs/models
 */
const STATEMENT_MODEL_FALLBACKS: readonly string[] = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.0-flash",
];

function normalizeModelName(raw: string): string {
  const s = raw.trim();
  if (s.startsWith("models/")) return s.slice("models/".length);
  return s;
}

function buildStatementModelTryList(envOverride: string): string[] {
  const preferred = envOverride ? normalizeModelName(envOverride) : "";
  const list: string[] = [];
  if (preferred) list.push(preferred);
  for (const m of STATEMENT_MODEL_FALLBACKS) {
    if (!list.includes(m)) list.push(m);
  }
  return list;
}

async function generateStatementContent(
  genAI: GoogleGenerativeAI,
  modelName: string,
  base64Pdf: string,
  filename: string
): Promise<GenerateContentResult> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_INSTRUCTIONS,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: statementMaxOutputTokens(),
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  const userPrompt =
    "Extrais toutes les transactions du relevé PDF ci-joint et produis uniquement le JSON selon le schéma (aucun texte hors JSON).";
  return model.generateContent([
    {
      inlineData: {
        mimeType: "application/pdf",
        data: base64Pdf,
      },
    },
    { text: `${userPrompt}\nFichier: ${filename || "statement.pdf"}` },
  ]);
}

const GEMINI_KEY_HELP_FR =
  "Clé API refusée par Google. Créez une clé sur https://aistudio.google.com/apikey (Google AI Studio), " +
  "copiez-la dans .env.local sous GEMINI_API_KEY=… sans guillemets ni espace en trop, redémarrez le serveur (npm run dev). " +
  "Une clé « API Google Cloud » classique peut être refusée si l’API Generative Language n’est pas autorisée ou si des restrictions de clé bloquent generativelanguage.googleapis.com.";

export async function extractTransactionsFromPdfBuffer(
  pdfBuffer: Buffer,
  filename: string
): Promise<NormalizedExtractedLine[]> {
  assertPdfBuffer(pdfBuffer);
  const apiKey = geminiApiKey();
  const envModel = normalizeEnvSecret(
    process.env.GEMINI_STATEMENT_MODEL || process.env.GOOGLE_STATEMENT_MODEL || ""
  );
  const modelTryList = buildStatementModelTryList(envModel);

  const genAI = new GoogleGenerativeAI(apiKey);
  const base64 = pdfBuffer.toString("base64");

  let result: GenerateContentResult | undefined;
  let lastError: unknown;
  for (const modelName of modelTryList) {
    try {
      result = await generateStatementContent(genAI, modelName, base64, filename);
      break;
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (isGeminiApiKeyInvalidMessage(msg)) {
        throw new Error(GEMINI_KEY_HELP_FR);
      }
      if (isGeminiModelNotFoundMessage(msg)) {
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  if (!result) {
    const hint =
      lastError instanceof Error ? lastError.message : String(lastError ?? "");
    throw new Error(
      `Aucun modèle Gemini utilisable pour l’import (relevé PDF). Modèles essayés : ${modelTryList.join(", ")}. ` +
        `Les anciens id (gemini-1.5-*) sont souvent retirés par Google ; préférez gemini-2.5-flash. ` +
        `Détails : ${hint.slice(0, 400)}`
    );
  }

  const fb = result.response.promptFeedback;
  if (fb?.blockReason && fb.blockReason !== BlockReason.BLOCKED_REASON_UNSPECIFIED) {
    throw new Error(
      fb.blockReasonMessage ??
        "La requête a été bloquée par les filtres de sécurité du modèle. Réessayez ou utilisez un autre relevé."
    );
  }

  let text: string;
  try {
    text = result.response.text().trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      msg.includes("block")
        ? "Réponse bloquée ou refusée par le modèle. Vérifiez le contenu du PDF."
        : "Réponse invalide du modèle Gemini."
    );
  }

  if (!text) {
    throw new Error("Réponse vide du modèle d'extraction.");
  }

  const candidate = result.response.candidates?.[0];
  const finishReason = candidate?.finishReason;

  if (finishReason === FinishReason.MAX_TOKENS) {
    throw new Error(
      "Réponse du modèle tronquée (limite de jetons de sortie). Le PDF contient probablement trop de mouvements pour un seul appel. " +
        `Augmentez GEMINI_STATEMENT_MAX_OUTPUT_TOKENS (limite actuelle : ${statementMaxOutputTokens()}), ou importez un relevé plus court / découpé par période.`
    );
  }

  let parsed: { transactions?: unknown[] };
  try {
    parsed = JSON.parse(stripMarkdownJsonFence(text)) as { transactions?: unknown[] };
  } catch {
    throw new Error(
      "Impossible de lire la réponse JSON du modèle (relevé très long, sortie coupée ou format inattendu). " +
        `Essayez GEMINI_STATEMENT_MAX_OUTPUT_TOKENS=131072 (ou plus) dans .env.local ; limite actuelle : ${statementMaxOutputTokens()}. Redémarrez le serveur après changement.`
    );
  }
  const arr = Array.isArray(parsed.transactions) ? parsed.transactions : [];
  return normalizeLines(arr);
}
