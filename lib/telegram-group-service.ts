import { setDefaultResultOrder } from "node:dns";

// Render resolves *.onrender.com to IPv6 first. That path fails from one
// service to another, while the public IPv4 address works.
setDefaultResultOrder("ipv4first");

type ServiceConfig = { url: string; apiKey: string };

export type TelegramServiceCall =
  | { ok: true; data: unknown }
  | { ok: false; status: number; error: string };

function serviceConfig(): ServiceConfig | { error: string } {
  const url = (process.env["TELEGRAM_GROUP_SERVICE_URL"] ?? "").trim().replace(/\/$/, "");
  const apiKey = (process.env["TELEGRAM_SERVICE_API_KEY"] ?? "").trim();
  if (!url || !apiKey) return { error: "Service Telegram non configuré." };
  return { url, apiKey };
}

function failureText(error: unknown): string {
  if (!(error instanceof Error)) return "erreur réseau";
  const cause = error.cause instanceof Error ? error.cause.message : "";
  return cause ? `${error.message} (${cause})` : error.message;
}

export async function callTelegramGroupService(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<TelegramServiceCall> {
  const cfg = serviceConfig();
  if ("error" in cfg) return { ok: false, status: 503, error: cfg.error };

  try {
    const res = await fetch(`${cfg.url}${path}`, {
      method: init?.method ?? "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": cfg.apiKey,
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(25_000),
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    if (text) {
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return {
          ok: false,
          status: 502,
          error: `Le service Telegram a répondu ${res.status} sans JSON.`,
        };
      }
    }
    if (!res.ok) {
      const detail = data.detail ?? data.error;
      const error = typeof detail === "string" ? detail : `Erreur ${res.status} du service Telegram.`;
      return { ok: false, status: res.status, error };
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: `Service Telegram inaccessible: ${failureText(error)}`,
    };
  }
}
