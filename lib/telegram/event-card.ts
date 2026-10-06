import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Ссылка на конкретную встречу: t.me/<bot>?start=e_<uuid>.
 * Человек жмёт — бот присылает карточку встречи (название, дата, место,
 * свободные места) с кнопкой «Открыть встречу», которая ведёт прямо на
 * страницу события (там «Я иду»). Незарегистрированный сначала проходит
 * анкету и после неё попадает на эту же встречу.
 */
export const EVENT_START_PREFIX = "e_";

export function eventShareLink(botUsername: string, eventId: string): string {
  return `https://t.me/${botUsername}?start=${EVENT_START_PREFIX}${eventId}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatWhen(date: string, time: string, endTime: string | null): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });
  const t = time.slice(0, 5);
  return endTime ? `${day} · ${t}–${endTime.slice(0, 5)}` : `${day} · ${t}`;
}

function shortAddress(address: string | null, city: string | null): string {
  if (!address) return "";
  let a = address.replace(/^Россия,\s*/i, "");
  if (city) a = a.replace(new RegExp(`^${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},\\s*`, "i"), "");
  return a;
}

function priceLine(e: {
  is_business: boolean;
  cost_type: string | null;
  business_pricing_type: string | null;
  business_pricing_details: string | null;
}): string {
  if (e.is_business) {
    if (e.business_pricing_details) return `💳 ${e.business_pricing_details}`;
    if (e.business_pricing_type === "free") return "🎟 Вход свободный";
    return "";
  }
  if (e.cost_type === "free") return "🎟 Бесплатно";
  if (e.cost_type === "negotiable") return "💬 Расходы — по договорённости";
  return "";
}

export interface EventCard {
  ok: boolean;
  text: string;
  photoUrl: string | null;
}

export async function buildEventCard(admin: Admin, eventId: string): Promise<EventCard> {
  const { data: e } = await admin
    .from("events")
    .select(
      "id, title, description, city, place_name, address, event_date, event_time, event_end_time, seats_total, seats_taken, status, is_business, cost_type, business_pricing_type, business_pricing_details, photo_url, is_anonymous"
    )
    .eq("id", eventId)
    .maybeSingle();

  if (!e) return { ok: false, text: "Не нашёл такую встречу 🤔 Загляни в приложение — там много других.", photoUrl: null };
  if (e.status !== "published") {
    return { ok: false, text: `«${escapeHtml(e.title)}» уже прошла 🙏 Загляни в приложение — там есть и другие встречи.`, photoUrl: null };
  }

  const free = Math.max(0, (e.seats_total ?? 0) - (e.seats_taken ?? 0));
  // Анонимная встреча — адрес открывается только после одобрения заявки.
  const place = e.is_anonymous
    ? "Место откроется после одобрения заявки"
    : [e.place_name?.trim(), shortAddress(e.address, e.city)].filter(Boolean).join(" — ");
  const desc = (e.description ?? "").trim();
  const details = [
    `📅 ${formatWhen(e.event_date, e.event_time, e.event_end_time)}`,
    place ? `📍 ${escapeHtml(place)}` : "",
    free > 0 ? `👥 Свободно ${free} из ${e.seats_total} мест` : "👥 Мест больше нет — но можно встать в очередь",
    priceLine(e) ? escapeHtml(priceLine(e)) : "",
  ].filter(Boolean);
  const blocks = [
    `${e.is_business ? "🎉" : "🙌"} <b>${escapeHtml(e.title)}</b>`,
    details.join("\n"),
    desc ? escapeHtml(desc.length > 350 ? `${desc.slice(0, 347)}…` : desc) : "",
    "Жми «Открыть встречу» — там можно нажать «Я иду» 👇",
  ].filter(Boolean);

  return { ok: true, text: blocks.join("\n\n"), photoUrl: e.photo_url ?? null };
}
