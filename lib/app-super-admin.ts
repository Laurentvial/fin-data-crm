import { sql } from "@/lib/db";

export async function isAppSuperAdmin(userId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 AS ok
    FROM app_super_admins
    WHERE user_id = ${userId}::uuid
    LIMIT 1
  `;
  const list = Array.isArray(rows) ? rows : rows != null ? [rows] : [];
  return list.length > 0;
}
