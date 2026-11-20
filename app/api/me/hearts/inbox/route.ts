import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { ageFrom } from "@/lib/likes";

export const dynamic = "force-dynamic";
const PAGE = 60;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const STAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/;
const failure = () => NextResponse.json({ error: "hearts_unavailable" }, { status: 503 });

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  let query = admin.from("notifications").select("id, created_at, is_read, payload")
    .eq("user_id", me.userId).eq("type", "heart")
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE + 1);
  const cursor = req.nextUrl.searchParams.get("cursor");
  if (cursor !== null) {
    const [when, id, extra] = cursor.split("_");
    if (extra !== undefined || !STAMP.test(when ?? "") || !UUID.test(id ?? "")) {
      return NextResponse.json({ error: "bad_cursor" }, { status: 400 });
    }
    query = query.or(`created_at.lt."${when}",and(created_at.eq."${when}",id.lt.${id})`);
  }
  const page = await query;
  if (page.error) return failure();
  const rows = (page.data ?? []).slice(0, PAGE);
  const ids = [...new Set(rows.map(n => n.payload?.fromUserId).filter((id): id is string => typeof id === "string" && UUID.test(id)))];
  const last = rows[rows.length - 1];
  const nextCursor = last && (page.data?.length ?? 0) > PAGE ? `${last.created_at}_${last.id}` : null;
  if (!ids.length) return NextResponse.json({ items: [], nextCursor });
  const [users, outgoing, incoming] = await Promise.all([
    admin.from("users").select("id,name,birth_date,avatar_url,moderation_status").in("id", ids),
    admin.from("blocks").select("blocked_id").eq("blocker_id", me.userId).in("blocked_id", ids),
    admin.from("blocks").select("blocker_id").eq("blocked_id", me.userId).in("blocker_id", ids),
  ]);
  if (users.error || incoming.error || outgoing.error) return failure();
  const blocked = new Set([...incoming.data.map(b => b.blocker_id), ...outgoing.data.map(b => b.blocked_id)]);
  const profiles = new Map(users.data.filter(u => !blocked.has(u.id) && (!u.moderation_status || u.moderation_status === "active")).map(u => [u.id, u]));
  const items = rows.flatMap(n => {
    const u = profiles.get(n.payload?.fromUserId);
    if (!u) return [];
    profiles.delete(u.id);
    return [{
      id: u.id, name: u.name?.trim() || "Кто-то", age: ageFrom(u.birth_date),
      avatarUrl: u.avatar_url, createdAt: n.created_at, unread: !(n.payload?.profileViewed ?? n.is_read),
    }];
  });
  return NextResponse.json({ items, nextCursor });
}

export async function PATCH(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const senderId = (await req.json().catch(() => null))?.senderId;
  if (typeof senderId !== "string" || !UUID.test(senderId)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const admin = createAdminClient();
  const rows = await admin.from("notifications").select("id,payload").eq("user_id", me.userId)
    .eq("type", "heart").eq("payload->>fromUserId", senderId);
  if (rows.error) return failure();
  const updates = await Promise.all(rows.data.filter(n => !n.payload?.profileViewed).map(n =>
    admin.from("notifications").update({ is_read: true, payload: { ...n.payload, profileViewed: true } })
      .eq("user_id", me.userId).eq("id", n.id).eq("type", "heart")
  ));
  if (updates.some(r => r.error)) return failure();
  return NextResponse.json({ ok: true });
}
