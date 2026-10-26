#!/usr/bin/env node
/**
 * Export / import BigBoss sociétés & comptes via les API entity-export / entity-import.
 *
 * Authentification : cookie de session Neon Auth (copier depuis les DevTools après login).
 *
 * Exemples :
 *   node scripts/entity-transfer-cli.mjs export \
 *     --base-url https://source.example \
 *     --cookie "neon-auth.session=..." \
 *     --status-id 550e8400-e29b-41d4-a716-446655440000 \
 *     --out export-comptes.json
 *
 *   node scripts/entity-transfer-cli.mjs export \
 *     --base-url https://source.example \
 *     --cookie "..." \
 *     --ids id1,id2 \
 *     --out export-comptes.json
 *
 *   node scripts/entity-transfer-cli.mjs import \
 *     --base-url https://cible.example \
 *     --cookie "..." \
 *     --file export-comptes.json
 */

import { readFileSync, writeFileSync } from "node:fs";

const IMPORT_BATCH_SIZE = 5;
const ENTITY_KIND = "bigboss-entity-export";
const ENTITY_FORMAT_VERSION = 1;

function usage(code = 1) {
  console.error(`
Usage:
  entity-transfer-cli.mjs export --base-url URL --cookie COOKIE (--status-id UUID | --ids id1,id2) [--out file.json]
  entity-transfer-cli.mjs import --base-url URL --cookie COOKIE --file file.json

Options:
  --base-url   Origine sans slash final (ex. https://app.example.com)
  --cookie     En-tête Cookie complet (session connectée, rôle éditeur)
  --status-id  UUID de statut (export comptes via filters.account_status_ids)
  --ids        UUIDs séparés par des virgules (prioritaire sur --status-id)
  --out        Fichier de sortie export (défaut: bigboss-export.json)
  --file       Fichier JSON à importer
`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { command: argv[2] };
  for (let i = 3; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === "--base-url") {
      args.baseUrl = next?.replace(/\/+$/, "");
      i += 1;
    } else if (key === "--cookie") {
      args.cookie = next;
      i += 1;
    } else if (key === "--status-id") {
      args.statusId = next;
      i += 1;
    } else if (key === "--ids") {
      args.ids = next?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
      i += 1;
    } else if (key === "--out") {
      args.out = next;
      i += 1;
    } else if (key === "--file") {
      args.file = next;
      i += 1;
    } else if (key === "--help" || key === "-h") {
      usage(0);
    }
  }
  return args;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function apiPost(baseUrl, cookie, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      data && typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return { data, res };
}

async function cmdExport(args) {
  if (!args.baseUrl || !args.cookie) usage();
  const hasIds = Array.isArray(args.ids) && args.ids.length > 0;
  if (!hasIds && !args.statusId) {
    console.error("Indiquez --ids ou --status-id.");
    usage();
  }
  const body = {
    entity: "bank_accounts",
    ...(hasIds ? { ids: args.ids } : {}),
    ...(!hasIds && args.statusId
      ? { filters: { account_status_ids: [args.statusId] } }
      : {}),
  };
  const { data, res } = await apiPost(args.baseUrl, args.cookie, "/api/entity-export", body);
  const outPath = args.out ?? "bigboss-export.json";
  writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const serverName = match?.[1];
  const count = Array.isArray(data.items) ? data.items.length : 0;
  const requested =
    typeof data.requested_count === "number" ? data.requested_count : count;
  console.log(
    `Export enregistré : ${outPath}${serverName ? ` (serveur: ${serverName})` : ""} — ${count} compte(s), ${requested} demandé(s).`
  );
}

async function cmdImport(args) {
  if (!args.baseUrl || !args.cookie || !args.file) usage();
  const raw = readFileSync(args.file, "utf8");
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("Fichier JSON illisible.");
  }
  if (payload?.kind !== ENTITY_KIND) {
    throw new Error("Ce fichier n'est pas un export Sociétés / Comptes.");
  }
  const entity = payload.entity;
  const items = Array.isArray(payload.items) ? payload.items : [];
  const companies = Array.isArray(payload.companies) ? payload.companies : [];

  let inserted = 0;
  let skipped = 0;
  let companiesInserted = 0;
  let companiesSkipped = 0;

  const postBatch = async (batchBody) => {
    const { data } = await apiPost(args.baseUrl, args.cookie, "/api/entity-import", batchBody);
    return data;
  };

  if (entity === "bank_accounts" && companies.length > 0) {
    for (const batch of chunk(companies, IMPORT_BATCH_SIZE)) {
      const data = await postBatch({
        kind: ENTITY_KIND,
        format_version: ENTITY_FORMAT_VERSION,
        entity: "companies",
        items: batch,
      });
      companiesInserted += data.inserted ?? 0;
      companiesSkipped += data.skipped ?? 0;
    }
  }

  for (const batch of chunk(items, IMPORT_BATCH_SIZE)) {
    const data = await postBatch({
      kind: ENTITY_KIND,
      format_version: ENTITY_FORMAT_VERSION,
      entity,
      items: batch,
    });
    inserted += data.inserted ?? 0;
    skipped += data.skipped ?? 0;
    if (typeof data.companies_inserted === "number") {
      companiesInserted += data.companies_inserted;
    }
    if (typeof data.companies_skipped === "number") {
      companiesSkipped += data.companies_skipped;
    }
  }

  console.log(
    entity === "bank_accounts"
      ? `Comptes : ${inserted} importé(s), ${skipped} ignoré(s). Sociétés : ${companiesInserted} importée(s), ${companiesSkipped} ignorée(s).`
      : `Sociétés : ${inserted} importé(s), ${skipped} ignoré(s).`
  );
}

const args = parseArgs(process.argv);
try {
  if (args.command === "export") {
    await cmdExport(args);
  } else if (args.command === "import") {
    await cmdImport(args);
  } else {
    usage();
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
