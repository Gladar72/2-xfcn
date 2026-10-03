import { createAdminClient } from "@/lib/supabase/admin";
import { issueSessionToken } from "@/lib/telegram/session";

/** Ответ мобильному приложению после успешного входа: JWT + краткий профиль. */
export async function mobileSessionPayload(
  admin: ReturnType<typeof createAdminClient>,
  user: { id: string; telegram_id: number | null }
) {
  const token = issueSessionToken(user.id, user.telegram_id ?? 0);
  const { data: profile } = await admin
    .from("users")
    .select("id, name, avatar_url, city")
    .eq("id", user.id)
    .maybeSingle();
  return { status: "authenticated" as const, token, user: profile };
}
