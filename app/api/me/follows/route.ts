import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Row = { id: string; name: string | null; city: string | null; avatar_url: string | null; birth_date: string | null };

function age(b: string | null): number | null {
  if (!b) return null;
  const d = new Date(b);
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a > 0 && a < 120 ? a : null;
}

/**
 * Мои подписки.
 * GET /api/me/follows?summary=1 — { followers, following, followersPreview[], followingPreview[] } (для профиля).
 * GET /api/me/follows?tab=followers|following&q= — список людей: { items: [{ id, name, age, city, avatarUrl, iFollow, followsMe }] }.
 * Подписаться/отписаться — POST/DELETE /api/follows.
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const sp = new URL(req.url).searchParams;

  const [{ data: fr }, { data: fg }] = await Promise.all([
    admin.from("follows").select("follower_id, created_at").eq("organizer_id", me.userId).order("created_at", { ascending: false }).limit(2000),
    admin.from("follows").select("organizer_id, created_at").eq("follower_id", me.userId).order("created_at", { ascending: false }).limit(2000),
  ]);
  const followerIds = (fr ?? []).map((r) => r.follower_id as string);
  const followingIds = (fg ?? []).map((r) => r.organizer_id as string);

  const users = async (ids: string[]) => {
    if (!ids.length) return new Map<string, Row>();
    const { data } = await admin
      .from("users")
      .select("id, name, city, avatar_url, birth_date")
      .in("id", ids.slice(0, 1000))
      .eq("moderation_status", "active")
      .neq("is_profile_hidden", true);
    return new Map((data as Row[] | null ?? []).map((u) => [u.id, u]));
  };

  if (sp.get("summary") === "1") {
    const preview = await users([...followerIds.slice(0, 8), ...followingIds.slice(0, 8)]);
    const pick = (ids: string[]) =>
      ids.map((id) => preview.get(id)).filter((u): u is Row => !!u?.avatar_url).slice(0, 4).map((u) => ({ id: u.id, avatarUrl: u.avatar_url }));
    return NextResponse.json({ followers: followerIds.length, following: followingIds.length, followersPreview: pick(followerIds), followingPreview: pick(followingIds) });
  }

  const tab = sp.get("tab") === "following" ? "following" : "followers";
  const ids = tab === "followers" ? followerIds : followingIds;
  const map = await users(ids);
  const iFollow = new Set(followingIds);
  const followsMe = new Set(followerIds);
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const items = ids
    .map((id) => map.get(id))
    .filter((u): u is Row => !!u)
    .filter((u) => !q || (u.name ?? "").toLowerCase().includes(q))
    .map((u) => ({ id: u.id, name: u.name ?? "Без имени", age: age(u.birth_date), city: u.city, avatarUrl: u.avatar_url, iFollow: iFollow.has(u.id), followsMe: followsMe.has(u.id) }));
  return NextResponse.json({ items, followers: followerIds.length, following: followingIds.length });
}
