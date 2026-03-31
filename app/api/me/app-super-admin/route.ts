import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { isAppSuperAdmin } from "@/lib/app-super-admin";

export async function GET() {
  const { data: session } = await auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const super_admin = await isAppSuperAdmin(session.user.id);
  return NextResponse.json({ super_admin });
}
