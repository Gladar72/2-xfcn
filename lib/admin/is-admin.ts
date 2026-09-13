import { getCurrentUser } from "@/lib/telegram/current-user";

/**
 * Список telegram_id админов задаётся через ADMIN_TELEGRAM_IDS в .env
 * (числа через запятую, см. .env.example). Никакой отдельной роли в БД —
 * это сознательное упрощение для MVP (п.29 ТЗ просто требует "доступ
 * только admin user IDs", не заводя полноценную RBAC-систему).
 */
export async function getAdminUser() {
  const user = await getCurrentUser();
  if (!user) return null;

  const adminIds = (process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);

  if (!adminIds.includes(user.telegramId)) return null;

  return user;
}
