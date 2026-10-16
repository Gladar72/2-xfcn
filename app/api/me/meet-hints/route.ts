import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { ageFrom } from "@/lib/likes";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * GET /api/me/meet-hints — кто за последнюю неделю намекнул «Хочу на встречу».
 * Для карточек на вкладке «Встречи» и цифры на ней (какие уже разобраны —
 * помнит сам клиент, см. lib/meet-hints.ts).
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ items: [] });
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("notifications")
    .select("id, created_at, payload")
    .eq("user_id", me.userId)
    .eq("type", "meet_hint")
    .gte("created_at", new Date(Date.now() - WEEK_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(30);

  // Один человек — одна карточка (последний намёк).
  const seen = new Set<string>();
  const hints = (rows ?? [])
    .map((r) => ({ id: r.id as string, createdAt: r.created_at as string, from: (r.payload as { fromUserId?: string } | null)?.fromUserId }))
    .filter((r): r is { id: string; createdAt: string; from: string } => {
      if (!r.from || seen.has(r.from)) return false;
      seen.add(r.from);
      return true;
    });
  if (hints.length === 0) return NextResponse.json({ items: [] });

  const ids = hints.map((h) => h.from);
  const [{ data: users }, { data: blocks }] = await Promise.all([
    admin.from("users").select("id, name, avatar_url, birth_date, moderation_status").in("id", ids),
    admin.from("blocks").select("blocker_id, blocked_id").or(`blocker_id.eq.${me.userId},blocked_id.eq.${me.userId}`),
  ]);
  const blocked = new Set((blocks ?? []).flatMap((b) => [b.blocker_id as string, b.blocked_id as string]));
  const byId = new Map((users ?? []).map((u) => [u.id as string, u]));

  const items = hints
    .filter((h) => {
      const u = byId.get(h.from);
      if (!u || blocked.has(h.from)) return false;
      const st = u.moderation_status as string | null;
      return !st || st === "active";
    })
    .map((h) => {
      const u = byId.get(h.from)!;
      return {
        notificationId: h.id,
        userId: h.from,
        name: ((u.name as string | null) ?? "").trim() || "Кто-то",
        age: ageFrom(u.birth_date as string | null),
        avatarUrl: (u.avatar_url as string | null) ?? null,
        createdAt: h.createdAt,
      };
    });
  return NextResponse.json({ items });
}
