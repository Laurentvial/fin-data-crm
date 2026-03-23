"use client";

import { authClient } from "./client";

/** TTL in ms - avoid hitting get-session too often (helps with Render.com rate limits) */
const SESSION_CACHE_TTL_MS = 90_000; // 90 seconds

type SessionData = Awaited<ReturnType<typeof authClient.getSession>>["data"];

let cache: { data: SessionData; timestamp: number } | null = null;
/** In-flight request - coalesce concurrent callers to avoid 429 rate limits */
let inFlight: Promise<SessionData> | null = null;

/**
 * Get session with client-side caching to reduce /api/auth/get-session calls.
 * Render.com free tier rate-limits requests; this helps avoid 429 errors.
 * Concurrent callers share the same in-flight request.
 */
export async function getCachedSession(): Promise<SessionData> {
  const now = Date.now();
  if (cache && now - cache.timestamp < SESSION_CACHE_TTL_MS) {
    return cache.data;
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = (async () => {
    try {
      const { data } = await authClient.getSession();
      cache = { data, timestamp: Date.now() };
      return data;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Invalidate cache (call after signOut) */
export function invalidateSessionCache(): void {
  cache = null;
  inFlight = null;
}
