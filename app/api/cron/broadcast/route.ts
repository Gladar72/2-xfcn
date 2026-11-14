import { NextRequest, NextResponse } from "next/server";
import { InlineKeyboard, InputFile } from "grammy";
import path from "node:path";
import { existsSync } from "node:fs";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { sendInBatches } from "@/lib/server/background";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/broadcast  (Authorization: Bearer CRON_SECRET)
 * Body: { key, text, button?, city?, dry?, photo?, links? }  (button: false — без кнопки)
 *   photo — ссылка на картинку (текст уходит подписью, до 1024 символов);
 *   links — [{ text, url }] — кнопки-ссылки (по одной в ряд) над кнопкой приложения.
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
  const { data: done } = await admin.from("broadcast_sends").select("telegram_id").eq("key", key).eq("ok", true).limit(100000);
  const already = new Set((done ?? []).map((r) => Number(r.telegram_id)));

  let ids = Array.from(new Set(users.map((u) => Number(u.telegram_id))));
  // Пробная отправка: { only: [telegram_id, …] } — только этим людям (например, себе на проверку).
  if (Array.isArray(body?.only) && body.only.length) {
    const only = new Set<number>(body.only.map((x: unknown) => Number(x)));
    ids = ids.filter((id) => only.has(id));
  }
  const blocked = ids.filter((id) => lastBlock.get(id) === "blocked");
  const todo = ids.filter((id) => lastBlock.get(id) !== "blocked" && !already.has(id));
  const byCity: Record<string, number> = {};
  for (const u of users) if (todo.includes(Number(u.telegram_id))) byCity[u.city ?? "—"] = (byCity[u.city ?? "—"] ?? 0) + 1;
  const summary = { key, users: ids.length, blocked: blocked.length, alreadySent: already.size, toSend: todo.length, byCity };
  if (body?.dry) return NextResponse.json({ dry: true, ...summary });

  const appUrl = process.env.APP_URL;
  const button = typeof body?.button === "string" && body.button.trim() ? body.button.trim().slice(0, 40) : "Открыть «Место»";
  const links: { text: string; url: string }[] = Array.isArray(body?.links)
    ? body.links.filter((l: { text?: unknown; url?: unknown }) => typeof l?.text === "string" && typeof l?.url === "string" && /^https:\/\//.test(l.url as string)).slice(0, 4)
    : [];
  let markup: InlineKeyboard | undefined;
  if (links.length || (appUrl && body?.button !== false)) {
    markup = new InlineKeyboard();
    for (const l of links) markup.url(l.text.slice(0, 40), l.url).row();
    if (appUrl && body?.button !== false) markup.webApp(button, appUrl);
  }
  // photo: https-ссылка или путь внутри public/ ("/promo/x.jpg") — тогда грузим файлом.
  let photo: string | InputFile | null = null;
  if (typeof body?.photo === "string") {
    if (/^https:\/\//.test(body.photo)) photo = body.photo;
    else if (/^\/[a-z0-9/_.-]+$/i.test(body.photo) && !body.photo.includes("..")) {
      const file = path.join(process.cwd(), "public", body.photo);
      if (existsSync(file)) photo = file;
      else return NextResponse.json({ error: "photo_not_found" }, { status: 400 });
    }
  }
  if (photo && text.length > 1024) return NextResponse.json({ error: "caption_too_long" }, { status: 400 });
  const api = getBot().api;
  let ok = 0;
  let failed = 0;
  let lastError: string | null = null;
  await sendInBatches(todo, async (id) => {
    try {
      if (photo) {
        // Файл грузим один раз, дальше шлём по file_id.
        const sent = await api.sendPhoto(id, typeof photo === "string" && !photo.startsWith("/") ? photo : new InputFile(photo as string), { caption: text, reply_markup: markup });
        const fid = sent.photo?.[sent.photo.length - 1]?.file_id;
        if (fid) photo = fid;
      }
      else await api.sendMessage(id, text, { reply_markup: markup });
      ok += 1;
      await admin.from("broadcast_sends").upsert({ key, telegram_id: id, ok: true });
    } catch (err) {
      failed += 1;
      const msg = String((err as Error)?.message ?? err).slice(0, 200);
      lastError = msg;
      await admin.from("broadcast_sends").upsert({ key, telegram_id: id, ok: false, error: msg });
    }
  });
  return NextResponse.json({ sent: ok, failed, lastError, ...summary });
}
