import { auth } from "@/lib/auth/server";

export default auth.middleware({
  loginUrl: "/auth/sign-in",
});

export const config = {
  matcher: [
    "/",
    "/societes",
    "/societes/:path*",
    "/companies",
    "/companies/:path*",
    "/reporting",
    "/reporting/:path*",
    "/settings",
    "/settings/:path*",
  ],
};
