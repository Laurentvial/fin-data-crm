import { createNeonAuth } from "@neondatabase/auth/next/server";

const baseUrl = process.env.NEON_AUTH_BASE_URL;
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

if (!baseUrl || !cookieSecret) {
  throw new Error(
    "Missing required auth config. Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET in your environment (e.g. Render Dashboard → Environment)."
  );
}

const neonAuth = createNeonAuth({
  baseUrl,
  cookies: {
    secret: cookieSecret,
    // Signed session-data cookie: while valid, middleware skips upstream /get-session (fast path).
    // On cache miss, middleware calls Neon Auth; any non-OK (429, timeout, 502) is treated as
    // logged out and redirects to login — so longer TTL reduces spurious "disconnections".
    // Raise further (e.g. 3600) if Neon Auth / hosting limits allow.
    sessionDataTtl: 1800, // 30 minutes (SDK default 300; was 600)
  },
});

type NeonAuth = typeof neonAuth;
type GetSessionArgs = Parameters<NeonAuth["getSession"]>;
type GetSessionResult = Awaited<ReturnType<NeonAuth["getSession"]>>;
type SessionData = GetSessionResult["data"];
type SessionDataWithRole = SessionData extends { user: infer U }
  ? Omit<SessionData, "user"> & { user: U & { role?: string | null } }
  : SessionData;
type GetSessionResultWithRole = Omit<GetSessionResult, "data"> & {
  data: SessionDataWithRole;
};

export const auth = neonAuth as Omit<NeonAuth, "getSession"> & {
  getSession: (...args: GetSessionArgs) => Promise<GetSessionResultWithRole>;
};
