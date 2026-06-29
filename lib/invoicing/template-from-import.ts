import { BlockReason, FinishReason, GoogleGenerativeAI, type GenerateContentResult } from "@google/generative-ai";

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const DEFAULT_TEMPLATE_MAX_OUTPUT_TOKENS = 32_768;
const MIN_TEMPLATE_MAX_OUTPUT_TOKENS = 4_096;
const CAP_TEMPLATE_MAX_OUTPUT_TOKENS = 262_144;

const TEMPLATE_MODEL_FALLBACKS: readonly string[] = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.0-flash",
];

const TEMPLATE_SYSTEM_INSTRUCTIONS = `Tu es un expert en génération de templates de facture HTML Handlebars.
Objectif: reproduire la structure visuelle d'un document importé (image ou PDF) en un template HTML Handlebars.

Règles strictes de sortie:
- Réponds uniquement avec du HTML (aucun markdown, aucune explication, aucun bloc de code).
- Le résultat doit être un document complet: <!DOCTYPE html> ... </html>.
- Utilise des placeholders Handlebars compatibles avec ce projet.
- Utilise les helpers existants: {{formatDate ...}} et {{formatNumber ...}}.
- N'invente pas de helpers.
- Utilise les objets disponibles:
  - company (name, address, siret, vat_number, website, logo_url)
  - customer (name, address, siret, vat)
  - invoice (number, issueDate, dueDate, subtotal, taxAmount, total, currency, vatRate, isEur)
  - lineItems[] (description, quantity, unit_price, vat_rate, amount)
- payment (iban, bic, installmentsEnabled, installmentsMention)
  - countryRules (requiredMentions, vatLabel)
- Pour les listes, utilise {{#each lineItems}}...{{/each}}.
- Ajoute des blocs conditionnels pertinents avec {{#if ...}}.
- Préserve l'aspect global du document importé (typographie, alignements, sections).
- Fournis du CSS inline dans <style> pour un rendu PDF stable.
- Le HTML doit être directement compilable avec Handlebars.`;

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

function normalizeModelName(raw: string): string {
  const s = raw.trim();
  return s.startsWith("models/") ? s.slice("models/".length) : s;
}

function buildModelTryList(envOverride: string): string[] {
  const preferred = envOverride ? normalizeModelName(envOverride) : "";
  const list: string[] = [];
  if (preferred) list.push(preferred);
  for (const model of TEMPLATE_MODEL_FALLBACKS) {
    if (!list.includes(model)) list.push(model);
  }
  return list;
}

function templateMaxOutputTokens(): number {
  const raw = process.env.GEMINI_TEMPLATE_MAX_OUTPUT_TOKENS;
  if (raw == null || String(raw).trim() === "") return DEFAULT_TEMPLATE_MAX_OUTPUT_TOKENS;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < MIN_TEMPLATE_MAX_OUTPUT_TOKENS) {
    return DEFAULT_TEMPLATE_MAX_OUTPUT_TOKENS;
  }
  return Math.min(n, CAP_TEMPLATE_MAX_OUTPUT_TOKENS);
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

function assertSupportedImportedFile(buf: Buffer, mimeType: string): void {
  if (buf.length === 0) {
    throw new Error("Le fichier importé est vide.");
  }
  if (buf.length > MAX_IMPORT_BYTES) {
    throw new Error(`Le fichier dépasse la taille maximale (${Math.floor(MAX_IMPORT_BYTES / (1024 * 1024))} Mo).`);
  }
  if (mimeType === "application/pdf") {
    const head = buf.subarray(0, 5).toString("utf8");
    if (!head.startsWith("%PDF")) {
      throw new Error("Le fichier ne semble pas être un PDF valide.");
    }
  } else if (!mimeType.startsWith("image/")) {
    throw new Error("Seuls les fichiers image/* ou application/pdf sont acceptés.");
  }
}

function stripMarkdownCodeFence(raw: string): string {
  let s = raw.trim();
  const m = /^```(?:html|handlebars)?\s*\r?\n?([\s\S]*?)\r?\n?```$/im.exec(s);
  if (m) s = m[1]!.trim();
  return s;
}

function assertGeneratedTemplateIsUsable(html: string): void {
  const normalized = html.trim().toLowerCase();
  if (!normalized.includes("<html") || !normalized.includes("</html>")) {
    throw new Error("La réponse IA ne contient pas un document HTML complet.");
  }
  if (!html.includes("{{")) {
    throw new Error("La réponse IA ne contient pas de placeholders Handlebars.");
  }
}

async function generateTemplateContent(
  genAI: GoogleGenerativeAI,
  modelName: string,
  base64Data: string,
  mimeType: string,
  filename: string,
  countryCode: string
): Promise<GenerateContentResult> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: TEMPLATE_SYSTEM_INSTRUCTIONS,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: templateMaxOutputTokens(),
      responseMimeType: "text/plain",
    },
  });

  const userPrompt = [
    `Reproduis ce modèle de facture en template HTML Handlebars pour le pays ${countryCode}.`,
    "Respecte les sections habituelles d'une facture: en-tête, bloc émetteur/client, tableau lignes, totaux, paiement, mentions.",
    "Le résultat doit être directement compilable dans le projet.",
    `Fichier: ${filename || "imported-template"}`,
  ].join("\n");

  return model.generateContent([
    {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    },
    { text: userPrompt },
  ]);
}

export interface GeneratedTemplateResult {
  templateContent: string;
  modelUsed: string;
}

export async function generateHandlebarsTemplateFromImportedDocument(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string,
  countryCode: string
): Promise<GeneratedTemplateResult> {
  const cleanMime = (mimeType || "").trim().toLowerCase();
  assertSupportedImportedFile(fileBuffer, cleanMime);

  const apiKey = geminiApiKey();
  const envModel = normalizeEnvSecret(process.env.GEMINI_TEMPLATE_MODEL || "");
  const modelTryList = buildModelTryList(envModel);
  const genAI = new GoogleGenerativeAI(apiKey);
  const base64 = fileBuffer.toString("base64");

  let result: GenerateContentResult | undefined;
  let modelUsed = "";
  let lastError: unknown;

  for (const modelName of modelTryList) {
    try {
      result = await generateTemplateContent(genAI, modelName, base64, cleanMime, filename, countryCode);
      modelUsed = modelName;
      break;
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (isGeminiApiKeyInvalidMessage(msg)) {
        throw new Error(
          "Clé API refusée par Google. Vérifiez GEMINI_API_KEY (ou GOOGLE_GENERATIVE_AI_API_KEY), puis redémarrez le serveur."
        );
      }
      if (isGeminiModelNotFoundMessage(msg)) {
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  if (!result) {
    const hint = lastError instanceof Error ? lastError.message : String(lastError ?? "");
    throw new Error(
      `Aucun modèle Gemini utilisable pour générer le template. Modèles essayés : ${modelTryList.join(", ")}. Détails : ${hint.slice(0, 400)}`
    );
  }

  const feedback = result.response.promptFeedback;
  if (feedback?.blockReason && feedback.blockReason !== BlockReason.BLOCKED_REASON_UNSPECIFIED) {
    throw new Error(
      feedback.blockReasonMessage ??
        "La requête a été bloquée par les filtres de sécurité du modèle. Essayez un autre document."
    );
  }

  const candidate = result.response.candidates?.[0];
  if (candidate?.finishReason === FinishReason.MAX_TOKENS) {
    throw new Error(
      "La réponse du modèle a été tronquée (limite de jetons). Réessayez avec un document plus simple ou augmentez GEMINI_TEMPLATE_MAX_OUTPUT_TOKENS."
    );
  }

  const text = stripMarkdownCodeFence(result.response.text().trim());
  if (!text) {
    throw new Error("Réponse vide du modèle lors de la génération du template.");
  }

  assertGeneratedTemplateIsUsable(text);
  return { templateContent: text, modelUsed };
}
