import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Фото профиля для галереи: главное (users.avatar_url) + до двух
 * дополнительных (user_photos с position > 0). Строки position = 0 — это
 * история смены главного фото, в галерею они не попадают.
 */
export async function getUserPhotos(admin: Admin, userId: string, avatarUrl: string | null): Promise<string[]> {
  const { data } = await admin
    .from("user_photos")
    .select("url, position")
    .eq("user_id", userId)
    .gt("position", 0)
    .order("position", { ascending: true })
    .limit(2);
  const extra = (data ?? []).map((r) => r.url as string).filter(Boolean);
  return [...(avatarUrl ? [avatarUrl] : []), ...extra];
}
