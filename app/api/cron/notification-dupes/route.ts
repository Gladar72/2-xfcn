import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/notification-dupes — раз в час (deploy/yandex/crontab).
 *
 * Сторож: не получил ли кто-то за последний час одно и то же уведомление дважды
 * (одинаковые тип + человек + payload) или всплеск (> 5 уведомлений одного типа).
 * Если да — пишет админам в бота (ADMIN_TELEGRAM_IDS). Если всё чисто — молчит.
 * Сообщения чатов: одна непрочитанная строка на чат — норма (её поднимает новое сообщение).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - 65 * 60 * 1000).toISOString();
  const { data: rows } = await admin
    .from("notifications")
    .select("type, user_id, payload, is_read, created_at")
    .gte("created_at", since)
    .limit(5000);

  const dup = new Map<string, { type: string; userId: string; n: number; first: string; last: string }>();
  const burst = new Map<string, { type: string; userId: string; n: number }>();
  for (const r of rows ?? []) {
    const type = r.type as string;
    const userId = r.user_id as string;
    const b = burst.get(`${type}|${userId}`) ?? { type, userId, n: 0 };
    b.n += 1;
    burst.set(`${type}|${userId}`, b);
    if (type === "new_message" && r.is_read) continue;
    const k = `${type}|${userId}|${JSON.stringify(r.payload ?? {})}`;
    const d = dup.get(k) ?? { type, userId, n: 0, first: r.created_at as string, last: r.created_at as string };
    d.n += 1;
    if ((r.created_at as string) < d.first) d.first = r.created_at as string;
    if ((r.created_at as string) > d.last) d.last = r.created_at as string;
    dup.set(k, d);
  }
  const dups = [...dup.values()].filter((d) => d.n > 1).sort((a, b) => b.n - a.n);
  const bursts = [...burst.values()].filter((b) => b.n > 5).sort((a, b) => b.n - a.n);
  if (dups.length === 0 && bursts.length === 0) return NextResponse.json({ ok: true, dups: 0, bursts: 0 });

  const ids = [...new Set([...dups, ...bursts].map((x) => x.userId))];
  const { data: users } = await admin.from("users").select("id, name").in("id", ids);
  const nameOf = new Map((users ?? []).map((u) => [u.id as string, ((u.name as string | null) ?? "").trim() || "без имени"]));
  const hhmm = (iso: string) => new Date(iso).toISOString().slice(11, 16);

  const lines = [
    "⚠️ Дубли уведомлений за последний час",
    ...dups.slice(0, 8).map((d) => `• ${d.type} × ${d.n} — ${nameOf.get(d.userId)} (${hhmm(d.first)}–${hhmm(d.last)} UTC)`),
    ...(bursts.length ? ["Всплески (> 5 за час):", ...bursts.slice(0, 5).map((b) => `• ${b.type} × ${b.n} — ${nameOf.get(b.userId)}`)] : []),
  ];
  const text = lines.join("\n");
  const api = getBot().api;
  for (const id of (process.env.ADMIN_TELEGRAM_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    await api.sendMessage(Number(id), text).catch(() => {});
  }
  return NextResponse.json({ ok: false, dups: dups.length, bursts: bursts.length });
}
