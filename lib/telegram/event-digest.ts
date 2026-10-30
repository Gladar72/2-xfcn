import { InlineKeyboard } from "grammy";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { ANNOUNCE_OFF } from "@/lib/telegram/event-announce";
import { sendPushToUsers } from "@/lib/push/expo";
import { sendInBatches } from "@/lib/server/background";
import { eventUtcOffsetHours } from "@/lib/events/timing";

type Admin = ReturnType<typeof createAdminClient>;

/** callback-кнопка «🔕 Реже» под подборкой (обработчик — lib/telegram/bot.ts). */
export const DIGEST_LESS = "dig_less";

/** Во сколько по времени города приходит подборка. */
const DIGEST_LOCAL_HOUR = 18;
const MAX_ITEMS = 5;

/** Интерес из анкеты → категории встреч и разделы бизнес-событий, которые ему подходят. */
const INTEREST_MATCH: Record<string, string[]> = {
  Кофе: ["coffee", "food"],
  Завтраки: ["breakfast", "food"],
  Ужины: ["dinner", "food"],
  Бары: ["dinner", "party", "bars"],
  Стритфуд: ["dinner", "food"],
  Кулинария: ["dinner", "food", "workshops"],
  Готовка: ["dinner", "food", "workshops"],
  Вечеринки: ["party", "bars"],
  Танцы: ["party", "sport"],
  Караоке: ["party", "bars"],
  Кино: ["cinema"],
  Театр: ["theatre"],
  Музыка: ["concerts", "party"],
  Концерты: ["concerts"],
  "Джем-сейшны": ["concerts"],
  Выставки: ["art", "walk"],
  Искусство: ["art", "workshops"],
  Фотография: ["art", "walk", "workshops"],
  Книги: ["custom", "workshops"],
  "Книжный клуб": ["custom"],
  Настолки: ["custom", "games"],
  "Настольные игры": ["custom", "games"],
  Нетворкинг: ["custom", "workshops"],
  Технологии: ["custom", "workshops"],
  "Языковой обмен": ["custom"],
  Экскурсии: ["walk", "art"],
  Путешествия: ["walk", "active"],
  "Поездки на выходные": ["active", "walk"],
  Природа: ["walk", "active"],
  "Прогулки с собакой": ["walk"],
  Походы: ["active", "walk"],
  Кемпинг: ["active"],
  "Лыжи и сноуборд": ["active", "sport"],
  Бег: ["training", "running", "sport"],
  Спортзал: ["training", "gym", "sport"],
  Йога: ["training", "yoga", "sport"],
  Велосипед: ["training", "cycling", "active", "sport"],
  Бассейн: ["training", "sport"],
  Футбол: ["training", "football", "sport"],
  Теннис: ["training", "padel", "sport"],
  Единоборства: ["training", "sport"],
  Ролики: ["active", "sport"],
  Баня: ["active"],
};

interface DigestEvent {
  id: string;
  title: string;
  city: string;
  organizer_id: string;
  event_date: string;
  event_time: string;
  place_name: string | null;
  seats_taken: number;
  seats_total: number;
  is_business: boolean;
  biz_category: string | null;
  business_pricing_type: string | null;
  business_pricing_details: string | null;
  created_at: string;
  category: { slug: string; emoji: string | null } | null;
  training_type: { slug: string } | null;
}

/** Запрос по списку id частями — длинный список не влезает в адрес запроса. */
async function byChunks<T>(
  ids: string[],
  q: (part: string[]) => PromiseLike<{ data: T[] | null }>
): Promise<{ data: T[] }> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await q(ids.slice(i, i + 150));
    out.push(...(data ?? []));
  }
  return { data: out };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function whenText(e: DigestEvent, offsetH: number): string {
  const now = new Date(Date.now() + offsetH * 3600_000);
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400_000).toISOString().slice(0, 10);
  const day =
    e.event_date === today
      ? "сегодня"
      : e.event_date === tomorrow
        ? "завтра"
        : new Date(`${e.event_date}T12:00:00Z`).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
  return `${day} ${e.event_time.slice(0, 5)}`;
}

function line(e: DigestEvent, offsetH: number): string {
  const emoji = e.is_business ? "🎉" : e.category?.emoji || "📍";
  const bits = [whenText(e, offsetH)];
  if (e.place_name) bits.push(e.place_name.slice(0, 40));
  if (e.is_business) bits.push(e.business_pricing_type === "free" ? "бесплатно" : e.business_pricing_details?.trim().slice(0, 30) || "");
  else bits.push(`${e.seats_taken + 1} из ${e.seats_total + 1}`);
  return `${emoji} <b>${esc(e.title.slice(0, 60))}</b>\n<i>${esc(bits.filter(Boolean).join(" · "))}</i>`;
}

/**
 * Раз в день (или раз в 3 дня — «Реже») в 18:00 по времени города — одна подборка
 * из 3–5 новых встреч и событий по интересам человека. Нет подходящего — ничего не шлём.
 * Запускается кроном раз в 5 минут вместе с напоминаниями (app/api/cron/event-reminders).
 */
export async function sendDueDigests(admin: Admin): Promise<{ users: number; sent: number }> {
  const nowMs = Date.now();
  const { data: users } = await admin
    .from("users")
    .select("id, telegram_id, city, announce_every_days, last_digest_at")
    .eq("event_announcements", true)
    .not("city", "is", null);
  const due = (users ?? []).filter((u) => {
    const offset = eventUtcOffsetHours({ city: u.city as string, longitude: null });
    const localHour = new Date(nowMs + offset * 3600_000).getUTCHours();
    if (localHour !== DIGEST_LOCAL_HOUR) return false;
    const every = Math.max(1, Number(u.announce_every_days) || 1);
    const last = u.last_digest_at ? Date.parse(u.last_digest_at as string) : 0;
    return nowMs - last > (every * 24 - 2) * 3600_000;
  });
  if (due.length === 0) return { users: 0, sent: 0 };

  const ids = due.map((u) => u.id as string);
  const cities = [...new Set(due.map((u) => u.city as string))];
  const todayIso = new Date(nowMs).toISOString().slice(0, 10);
  const untilIso = new Date(nowMs + 4 * 86400_000).toISOString().slice(0, 10);
  const [{ data: events }, { data: interests }, { data: blocks }, { data: members }] = await Promise.all([
    admin
      .from("events")
      .select(
        "id, title, city, organizer_id, event_date, event_time, place_name, seats_taken, seats_total, is_business, biz_category, business_pricing_type, business_pricing_details, created_at, category:categories(slug, emoji), training_type:training_types(slug)"
      )
      .eq("status", "published")
      .in("city", cities)
      .gte("event_date", todayIso)
      .lte("event_date", untilIso)
      .gte("created_at", new Date(nowMs - 4 * 86400_000).toISOString())
      .order("event_date")
      .order("event_time")
      .limit(500),
    byChunks(ids, (part) => admin.from("user_interests").select("user_id, interests(name)").in("user_id", part)),
    admin.from("blocks").select("blocker_id, blocked_id").limit(10000),
    byChunks(ids, (part) => admin.from("event_members").select("user_id, event_id").in("user_id", part)),
  ]);
  const evs = (events ?? []) as unknown as DigestEvent[];
  if (evs.length === 0) return { users: due.length, sent: 0 };

  const interestsBy = new Map<string, Set<string>>();
  for (const r of interests ?? []) {
    const name = (r.interests as unknown as { name: string } | null)?.name;
    if (!name) continue;
    const set = interestsBy.get(r.user_id as string) ?? new Set<string>();
    for (const k of INTEREST_MATCH[name] ?? []) set.add(k);
    interestsBy.set(r.user_id as string, set);
  }
  const blockedBy = new Map<string, Set<string>>();
  for (const b of blocks ?? []) {
    for (const [a, c] of [[b.blocker_id, b.blocked_id], [b.blocked_id, b.blocker_id]] as [string, string][]) {
      const s = blockedBy.get(a) ?? new Set<string>();
      s.add(c);
      blockedBy.set(a, s);
    }
  }
  const joined = new Set((members ?? []).map((m) => `${m.user_id}:${m.event_id}`));

  const appUrl = process.env.APP_URL ?? "";
  const api = getBot().api;
  let sent = 0;
  const pushUsers: { id: string; n: number; city: string }[] = [];

  await sendInBatches(due, async (u) => {
    const uid = u.id as string;
    const city = u.city as string;
    const since = u.last_digest_at ? Date.parse(u.last_digest_at as string) : nowMs - 2 * 86400_000;
    const keys = interestsBy.get(uid);
    const blocked = blockedBy.get(uid);
    const offset = eventUtcOffsetHours({ city, longitude: null });
    const nowLocal = new Date(nowMs + offset * 3600_000).toISOString().slice(0, 16).replace("T", " ");
    const picked = evs
      .filter((e) => e.city === city && e.organizer_id !== uid && !blocked?.has(e.organizer_id) && !joined.has(`${uid}:${e.id}`))
      .filter((e) => Date.parse(e.created_at) > since)
      .filter((e) => `${e.event_date} ${e.event_time.slice(0, 5)}` > nowLocal)
      .filter((e) => {
        if (!keys || keys.size === 0) return true; // интересы не указаны — подходит всё
        return [e.category?.slug, e.training_type?.slug, e.biz_category].some((k) => k && keys.has(k));
      })
      .slice(0, MAX_ITEMS);
    if (picked.length === 0) return;

    await admin.from("users").update({ last_digest_at: new Date(nowMs).toISOString() }).eq("id", uid);
    pushUsers.push({ id: uid, n: picked.length, city });
    if (!u.telegram_id) return;
    const head = keys && keys.size ? "Подобрал по твоим интересам:" : "Новое в городе:";
    const text = `🗓 <b>Что интересного в городе</b>\n${head}\n\n${picked.map((e) => line(e, offset)).join("\n\n")}`;
    const kb = new InlineKeyboard();
    if (appUrl) kb.webApp("👀 Смотреть все", appUrl).row();
    kb.text("🔕 Реже", DIGEST_LESS).text("Отключить", ANNOUNCE_OFF);
    try {
      await api.sendMessage(u.telegram_id as number, text, { parse_mode: "HTML", reply_markup: kb, link_preview_options: { is_disabled: true } });
      sent++;
    } catch (err) {
      console.error(`digest ${uid}:`, err);
    }
  });

  // Push в мобильное приложение — короткое «что нового».
  for (const p of pushUsers) {
    await sendPushToUsers(admin, [p.id], {
      title: "Что интересного в городе",
      body: p.n === 1 ? "Новая встреча по твоим интересам" : `${p.n} новых встреч по твоим интересам`,
      data: { url: "/", type: "event_digest" },
    }).catch(() => {});
  }
  return { users: due.length, sent };
}
