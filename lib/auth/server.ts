import { createNeonAuth } from "@neondatabase/auth/next/server";

const baseUrl = process.env.NEON_AUTH_BASE_URL;
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

if (!baseUrl || !cookieSecret) {
  throw new Error(
    "Missing required auth config. Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET in your environment (e.g. Render Dashboard → Environment)."
  );
}

export const auth = createNeonAuth({
  baseUrl,
  cookies: {
    secret: cookieSecret,
    // Longer TTL = fewer upstream /get-session calls = less 429 from Neon Auth rate limits
    sessionDataTtl: 600, // 10 minutes (default 300)
  },
});
