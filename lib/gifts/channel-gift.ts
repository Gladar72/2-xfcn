import type { createAdminClient } from "@/lib/supabase/admin";
import type { Plan } from "@/lib/subscriptions/limits";

type Admin = ReturnType<typeof createAdminClient>;

/** Ссылка из поста: t.me/<bot>?start=gift_<code>. */
export const GIFT_START_PREFIX = "gift_";
/** Кампания по умолчанию — подписчики канала «Двор». */
export const DEFAULT_GIFT_CAMPAIGN = "dvor";

export interface GiftCampaign {
  code: string;
  title: string;
  channel_id: number | null;
  channel_title: string | null;
  channel_username: string | null;
  /** Приветственный «кружок» — публикуется перед постом-подарком. */
  video_note_file_id: string | null;
  plan: Plan;
  days: number;
  is_active: boolean;
}

const PLAN_TITLE: Record<Plan, string> = { start: "Старт", medium: "Медиум", premium: "Премьер" };

export function planTitle(plan: Plan): string {
  return PLAN_TITLE[plan];
}

export async function getGiftCampaign(admin: Admin, code: string): Promise<GiftCampaign | null> {
  const { data } = await admin
    .from("gift_campaigns")
    .select("code, title, channel_id, channel_title, channel_username, video_note_file_id, plan, days, is_active")
    .eq("code", code)
    .maybeSingle();
  if (!data) return null;
  return { ...data, channel_id: data.channel_id === null ? null : Number(data.channel_id) } as GiftCampaign;
}

export async function bindGiftChannel(
  admin: Admin,
  code: string,
  channel: { id: number; title: string | null; username: string | null }
): Promise<void> {
  await admin
    .from("gift_campaigns")
    .update({ channel_id: channel.id, channel_title: channel.title, channel_username: channel.username })
    .eq("code", code);
}

export async function saveGiftVideoNote(admin: Admin, code: string, fileId: string): Promise<void> {
  await admin.from("gift_campaigns").update({ video_note_file_id: fileId }).eq("code", code);
}

export async function giftStats(admin: Admin, code: string): Promise<{ claimed: number; applied: number }> {
  const [{ count: claimed }, { count: applied }] = await Promise.all([
    admin.from("gift_claims").select("telegram_id", { count: "exact", head: true }).eq("campaign_code", code),
    admin
      .from("gift_claims")
      .select("telegram_id", { count: "exact", head: true })
      .eq("campaign_code", code)
      .not("applied_at", "is", null),
  ]);
  return { claimed: claimed ?? 0, applied: applied ?? 0 };
}

/**
 * Подарок начисляется поверх текущей подписки: если она уже есть — её срок
 * продлевается на N дней (тариф не понижаем), если нет — включается тариф
 * подарка на N дней. Возвращает дату окончания подписки.
 */
export async function grantGiftSubscription(admin: Admin, userId: string, plan: Plan, days: number): Promise<Date> {
  const now = new Date();
  const addMs = days * 24 * 60 * 60 * 1000;

  const { data: existing } = await admin
    .from("subscriptions")
    .select("id, current_period_end")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    const currentEnd = new Date(existing.current_period_end as string);
    const base = currentEnd > now ? currentEnd : now;
    const newEnd = new Date(base.getTime() + addMs);
    await admin.from("subscriptions").update({ current_period_end: newEnd.toISOString() }).eq("id", existing.id);
    return newEnd;
  }

  const end = new Date(now.getTime() + addMs);
  const { error } = await admin.from("subscriptions").insert({
    user_id: userId,
    plan,
    status: "active",
    current_period_start: now.toISOString(),
    current_period_end: end.toISOString(),
  });
  if (error) throw new Error(`gift: не удалось включить подписку ${userId}: ${error.message}`);
  return end;
}

export type ClaimResult =
  | { kind: "granted"; until: Date }
  | { kind: "pending" } // человек ещё не зарегистрирован — включится после регистрации
  | { kind: "already" };

/**
 * Записывает подарок за человеком (один раз на кампанию) и, если он уже
 * зарегистрирован в приложении, сразу включает подписку.
 */
export async function claimGift(admin: Admin, campaign: GiftCampaign, telegramId: number): Promise<ClaimResult> {
  const { data: inserted } = await admin
    .from("gift_claims")
    .upsert(
      { campaign_code: campaign.code, telegram_id: telegramId },
      { onConflict: "campaign_code,telegram_id", ignoreDuplicates: true }
    )
    .select("telegram_id");
  if (!inserted || inserted.length === 0) return { kind: "already" };

  const { data: user } = await admin.from("users").select("id").eq("telegram_id", telegramId).maybeSingle();
  if (!user) return { kind: "pending" };

  const until = await grantGiftSubscription(admin, user.id, campaign.plan, campaign.days);
  await admin
    .from("gift_claims")
    .update({ user_id: user.id, applied_at: new Date().toISOString() })
    .eq("campaign_code", campaign.code)
    .eq("telegram_id", telegramId);
  return { kind: "granted", until };
}

/** После регистрации в приложении — включаем подарки, которые ждали человека. */
export async function applyPendingGifts(admin: Admin, telegramId: number, userId: string): Promise<number> {
  const { data: pending } = await admin
    .from("gift_claims")
    .select("campaign_code, gift_campaigns(plan, days)")
    .eq("telegram_id", telegramId)
    .is("applied_at", null);

  let applied = 0;
  for (const row of pending ?? []) {
    const campaign = row.gift_campaigns as unknown as { plan: Plan; days: number } | null;
    if (!campaign) continue;
    // Захват строки — чтобы не начислить дважды при параллельных запросах.
    const { data: claimed } = await admin
      .from("gift_claims")
      .update({ user_id: userId, applied_at: new Date().toISOString() })
      .eq("campaign_code", row.campaign_code)
      .eq("telegram_id", telegramId)
      .is("applied_at", null)
      .select("telegram_id");
    if (!claimed || claimed.length === 0) continue;
    await grantGiftSubscription(admin, userId, campaign.plan, campaign.days);
    applied++;
  }
  return applied;
}

export function formatUntil(date: Date): string {
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
}

/** Пост в канал — от имени канала, с кнопкой-подарком. */
export function channelPostText(campaign: GiftCampaign): string {
  return (
    `Друзья, у нас для вас подарок 🎁\n\n` +
    `Мы сделали «Место» — сервис для тех, кому есть куда сходить, но не с кем. ` +
    `Сервис для одиночек: кино, кофе, пробежка, прогулка, вечеринка — находишь встречу рядом, ` +
    `жмёшь «Я иду» и идёшь уже в компании.\n\n` +
    `Каждому подписчику «${campaign.title}» — месяц подписки «${planTitle(campaign.plan)}» бесплатно. ` +
    `Жми кнопку ниже — бот всё включит сам 👇`
  );
}

/** Личное приветствие в боте после нажатия кнопки. */
export function welcomeText(campaign: GiftCampaign, result: ClaimResult): string {
  const intro =
    `Привет! 👋\n\n` +
    `Мы сделали «Место» — сервис для тех, кому есть куда сходить, но не с кем. Сервис для одиночек.\n` +
    `Кино, кофе, тренировка, прогулка, вечеринка — выбираешь встречу рядом, жмёшь «Я иду» и идёшь в компании. ` +
    `Или создаёшь свою — и к тебе присоединяются.\n\n`;

  if (result.kind === "granted") {
    return (
      intro +
      `🎁 Держи твой подарок — бесплатная подписка «${planTitle(campaign.plan)}» на месяц от создателей «${campaign.title}».\n` +
      `Уже включена ✅ — действует до ${formatUntil(result.until)}.\n\n` +
      `Открывай и находи компанию 👇`
    );
  }
  if (result.kind === "pending") {
    return (
      intro +
      `🎁 Держи твой подарок — бесплатная подписка «${planTitle(campaign.plan)}» на месяц от создателей «${campaign.title}».\n` +
      `Она уже закреплена за тобой: открой приложение и заполни короткую анкету — подписка включится сразу после регистрации ✅\n\n` +
      `Жми кнопку 👇`
    );
  }
  return `Подарок от «${campaign.title}» уже у тебя 🙂 Открывай приложение и находи компанию 👇`;
}
