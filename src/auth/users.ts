import "server-only";
import { getAdminDb } from "@/db/admin-client";

/** Map an external identity to our internal users.id (the Authorization anchor). */
export async function mapIdentityToUser(
  externalId: string,
): Promise<string | null> {
  const row = await getAdminDb()
    .selectFrom("users")
    .select("id")
    .where("external_auth_id", "=", externalId)
    .where("deleted_at", "is", null)
    .where("status", "=", "active")
    .executeTakeFirst();
  return row?.id ?? null;
}
