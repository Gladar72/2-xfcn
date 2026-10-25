import { NextRequest, NextResponse } from "next/server";
import { InlineKeyboard } from "grammy";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { sendInBatches } from "@/lib/server/background";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/broadcast  (Authorization: Bearer CRON_SECRET)
 * Body: { key, text, button?, city?, dry? }  (button: false — без кнопки)
 *
 * Разовая рассылка от бота всем, у кого есть Telegram (или только городу `city`).
 * Пропускает тех, кто сейчас заблокировал бота, и тех, кому эта рассылка (`key`) уже ушла —
 * повторный запуск ничего не дублирует. `dry: true` — только посчитать получателей.
 */
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!/^[a-z0-9_-]{3,60}$/.test(key) || text.length < 5 || text.length > 4000) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const city = typeof body?.city === "string" && body.city.trim() ? body.city.trim() : null;
  const admin = createAdminClient();

  // Все пользователи с Telegram (постранично — у Supabase предел 1000 строк за запрос).
  const users: { telegram_id: number; city: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    let q = admin.from("users").select("telegram_id, city").gt("telegram_id", 0).range(from, from + 999);
    if (city) q = q.eq("city", city);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: "users_failed", detail: error.message }, { status: 500 });
    users.push(...((data ?? []) as { telegram_id: number; city: string | null }[]));
    if (!data || data.length < 1000) break;
  }

  // Исключить города: { excludeCities: ["Москва", ...] }
  const exclude = new Set<string>(Array.isArray(body?.excludeCities) ? body.excludeCities.map((c: unknown) => String(c).trim().toLowerCase()) : []);
  if (exclude.size) {
    const kept = users.filter((u) => !exclude.has((u.city ?? "").trim().toLowerCase()));
    users.length = 0;
    users.push(...kept);
  }

  // Кто сейчас заблокировал бота (последняя запись — blocked).
  const lastBlock = new Map<number, string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("bot_blocks").select("telegram_id, status, at").order("at", { ascending: true }).range(from, from + 999);
    for (const r of data ?? []) lastBlock.set(Number(r.telegram_id), r.status as string);
    if (!data || data.length < 1000) break;
  }
  const { data: done } = await admin.from("broadcast_sends").select("telegram_id").eq("key", key).limit(100000);
  const already = new Set((done ?? []).map((r) => Number(r.telegram_id)));

  const ids = Array.from(new Set(users.map((u) => Number(u.telegram_id))));
  const blocked = ids.filter((id) => lastBlock.get(id) === "blocked");
  const todo = ids.filter((id) => lastBlock.get(id) !== "blocked" && !already.has(id));
  const byCity: Record<string, number> = {};
  for (const u of users) if (todo.includes(Number(u.telegram_id))) byCity[u.city ?? "—"] = (byCity[u.city ?? "—"] ?? 0) + 1;
  const summary = { key, users: ids.length, blocked: blocked.length, alreadySent: already.size, toSend: todo.length, byCity };
  if (body?.dry) return NextResponse.json({ dry: true, ...summary });

  const appUrl = process.env.APP_URL;
  const button = typeof body?.button === "string" && body.button.trim() ? body.button.trim().slice(0, 40) : "Открыть «Место»";
  const markup = appUrl && body?.button !== false ? new InlineKeyboard().webApp(button, appUrl) : undefined;
  const api = getBot().api;
  let ok = 0;
  let failed = 0;
  await sendInBatches(todo, async (id) => {
    try {
      await api.sendMessage(id, text, { reply_markup: markup });
      ok += 1;
      await admin.from("broadcast_sends").upsert({ key, telegram_id: id, ok: true });
    } catch (err) {
      failed += 1;
      await admin.from("broadcast_sends").upsert({ key, telegram_id: id, ok: false, error: String((err as Error)?.message ?? err).slice(0, 200) });
    }
  });
  return NextResponse.json({ sent: ok, failed, ...summary });
}
