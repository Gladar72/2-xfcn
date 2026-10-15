import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * «Сердечки» и намёки «Хочу на встречу» между людьми.
 *
 * Отдельной таблицы нет: каждое сердечко — строка notifications у того,
 * КОМУ его поставили (type = heart, payload.fromUserId = кто поставил).
 * Так оно сразу видно в «Уведомлениях», а взаимность — это две такие строки
 * навстречу друг другу. Намёк — type = meet_hint, взаимное — heart_mutual.
 */
type Admin = ReturnType<typeof createAdminClient>;

export const HEARTS_PER_DAY = 10;
export const HINTS_PER_DAY = 5;
export const LIKE_TYPES = ["heart", "heart_mutual", "meet_hint"] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Поставил ли from сердечко to. */
export async function hasHeart(admin: Admin, from: string, to: string): Promise<boolean> {
  const { data } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", to)
    .eq("type", "heart")
    .eq("payload->>fromUserId", from)
    .limit(1);
  return (data ?? []).length > 0;
}

/** Сколько сердечек (или намёков) from отправил за последние сутки. */
export async function sentToday(admin: Admin, from: string, type: "heart" | "meet_hint"): Promise<number> {
  const { count } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("type", type)
    .eq("payload->>fromUserId", from)
    .gte("created_at", new Date(Date.now() - DAY_MS).toISOString());
  return count ?? 0;
}

/** Есть ли блокировка между двумя людьми (в любую сторону). */
export async function isBlocked(admin: Admin, a: string, b: string): Promise<boolean> {
  const { data } = await admin
    .from("blocks")
    .select("blocker_id")
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
    .limit(1);
  return (data ?? []).length > 0;
}

export function ageFrom(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a -= 1;
  return a > 0 && a < 120 ? a : null;
}
