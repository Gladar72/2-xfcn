import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { ageFrom } from "@/lib/likes";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/hearts — кто поставил мне сердечко (и я ещё не ответил взаимностью).
 * Для шторки «Вам поставили сердечко» в профиле. unread — новые, ещё не показанные.
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ items: [] });
  const admin = createAdminClient();

  const [{ data: toMe }, { data: fromMe }] = await Promise.all([
    admin.from("notifications").select("id, is_read, created_at, payload").eq("user_id", me.userId).eq("type", "heart").order("created_at", { ascending: false }).limit(50),
    admin.from("notifications").select("user_id").eq("type", "heart").eq("payload->>fromUserId", me.userId).limit(500),
  ]);
  const answered = new Set((fromMe ?? []).map((r) => r.user_id as string));
  const rows = (toMe ?? [])
    .map((n) => ({ id: n.id as string, isRead: !!n.is_read, from: (n.payload as { fromUserId?: string } | null)?.fromUserId }))
    .filter((r): r is { id: string; isRead: boolean; from: string } => !!r.from && !answered.has(r.from));
  if (rows.length === 0) return NextResponse.json({ items: [] });

  const ids = [...new Set(rows.map((r) => r.from))];
  const [{ data: users }, { data: blocks }, { data: theirInt }, { data: myInt }] = await Promise.all([
    admin.from("users").select("id, name, avatar_url, birth_date, rating_avg, completed_meetings_count, moderation_status").in("id", ids),
    admin.from("blocks").select("blocker_id, blocked_id").or(`blocker_id.eq.${me.userId},blocked_id.eq.${me.userId}`),
    admin.from("user_interests").select("user_id, interests(name)").in("user_id", ids),
    admin.from("user_interests").select("interests(name)").eq("user_id", me.userId),
  ]);
  const blocked = new Set((blocks ?? []).flatMap((b) => [b.blocker_id as string, b.blocked_id as string]));
  const mine = new Set((myInt ?? []).map((r) => (r.interests as unknown as { name: string } | null)?.name).filter(Boolean) as string[]);
  const byId = new Map((users ?? []).map((u) => [u.id as string, u]));

  const items = rows
    .filter((r) => byId.has(r.from) && !blocked.has(r.from))
    .filter((r) => {
      const st = byId.get(r.from)!.moderation_status as string | null;
      return !st || st === "active";
    })
    .map((r) => {
      const u = byId.get(r.from)!;
      const common = (theirInt ?? [])
        .filter((x) => x.user_id === r.from)
        .map((x) => (x.interests as unknown as { name: string } | null)?.name)
        .filter((n): n is string => !!n && mine.has(n));
      return {
        notificationId: r.id,
        unread: !r.isRead,
        userId: r.from,
        name: (u.name as string | null) ?? "Кто-то",
        age: ageFrom(u.birth_date as string | null),
        avatarUrl: (u.avatar_url as string | null) ?? null,
        ratingAvg: Number(u.rating_avg ?? 0),
        meetings: Number(u.completed_meetings_count ?? 0),
        commonInterests: common.slice(0, 4),
      };
    });
  return NextResponse.json({ items });
}
