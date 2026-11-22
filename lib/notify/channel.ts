import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** Only profiles with no known native installation use Telegram for activity.
 * First app login is durable even if the last push token is no longer valid.
 * Older clients may have a registered token without the installation gift.
 */
export async function telegramNotificationUsers(admin: Admin, userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const allowed = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    try {
      const [installs, devices] = await Promise.all([
        admin.from("app_install_gifts").select("user_id").in("user_id", part),
        // One parent row per user, even for accounts with many devices.
        admin.from("users").select("id,push_tokens!inner(user_id)").in("id", part)
          .limit(1, { foreignTable: "push_tokens" }),
      ]);
      if (installs.error || devices.error) {
        console.error("notification channel lookup failed", installs.error?.code, devices.error?.code);
        continue;
      }
      const native = new Set((installs.data ?? []).map((row) => row.user_id as string));
      for (const device of devices.data ?? []) native.add(device.id);
      for (const id of part) if (!native.has(id)) allowed.add(id);
    } catch (err) {
      console.error("notification channel lookup failed", err);
    }
  }
  return allowed;
}

export async function usesTelegramNotifications(admin: Admin, userId: string): Promise<boolean> {
  return (await telegramNotificationUsers(admin, [userId])).has(userId);
}

/** Older support tickets and partner records only store a Telegram ID. */
export async function notificationAccount(admin: Admin, userId: string | null | undefined, telegramId: number | null | undefined): Promise<string | null> {
  if (userId || !telegramId) return userId ?? null;
  const { data, error } = await admin.from("users").select("id").eq("telegram_id", telegramId).maybeSingle();
  if (error) throw new Error(`notification account unavailable (${error.code})`);
  return data?.id ?? null;
}
