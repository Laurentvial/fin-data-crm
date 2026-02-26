import { auth } from "@/lib/auth/server";

export default auth.middleware({
  loginUrl: "/auth/sign-in",
});

export const config = {
  matcher: [
    "/",
    "/dashboard",
    "/dashboard/:path*",
    "/societes",
    "/societes/:path*",
    "/accounts",
    "/accounts/:path*",
    "/reporting",
    "/reporting/:path*",
    "/settings",
    "/settings/:path*",
  ],
};
