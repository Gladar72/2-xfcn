import { InlineKeyboard, type Api } from "grammy";
import type { createAdminClient } from "@/lib/supabase/admin";
import { grantPartnerPremium } from "@/lib/subscriptions/referrals";
import type { Plan } from "@/lib/subscriptions/limits";

type Admin = ReturnType<typeof createAdminClient>;

/** За сколько дней до окончания напоминаем продлить. */
const REMIND_BEFORE_DAYS = 3;

const PLAN_TITLE: Record<Plan, string> = { start: "Старт", medium: "Медиум", premium: "Премиум" };

interface SubRow {
  id: string;
  user_id: string;
  plan: Plan;
  current_period_end: string;
  user: { telegram_id: number } | null;
}

function renewKeyboard(): InlineKeyboard | undefined {
  const appUrl = process.env.APP_URL;
  return appUrl ? new InlineKeyboard().webApp("Продлить подписку", `${appUrl}?goto=subscriptions`) : undefined;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
}

/**
 * Срок подписки (раньше дата окончания нигде не проверялась — подписка,
 * в том числе подарочная, действовала бы вечно):
 *   1. Партнёрам-блогерам Премиум продлевается сам, пока они партнёры.
 *   2. За 3 дня до окончания — напоминание продлить (один раз за период).
 *   3. Срок прошёл — статус 'expired' и сообщение «подписка закончилась».
 */
export async function processSubscriptionExpiry(
  admin: Admin,
  api: Api
): Promise<{ renewedPartners: number; reminded: number; expired: number }> {
  const now = new Date();
  const remindUntil = new Date(now.getTime() + REMIND_BEFORE_DAYS * 24 * 60 * 60 * 1000);
  let renewedPartners = 0;
  let reminded = 0;
  let expired = 0;

  const { data: endingRows } = await admin
    .from("subscriptions")
    .select("id, user_id, plan, current_period_end, user:users(telegram_id)")
    .eq("status", "active")
    .lte("current_period_end", remindUntil.toISOString());
  const ending = (endingRows ?? []) as unknown as SubRow[];
  if (ending.length === 0) return { renewedPartners, reminded, expired };

  // 1. Партнёры — продлеваем Премиум и больше ничего с ними не делаем.
  const telegramIds = ending.map((s) => s.user?.telegram_id).filter((id): id is number => typeof id === "number");
  const { data: partners } = telegramIds.length
    ? await admin.from("referral_partners").select("telegram_id").eq("status", "approved").in("telegram_id", telegramIds)
    : { data: [] as { telegram_id: number }[] };
  const partnerIds = new Set((partners ?? []).map((p) => Number(p.telegram_id)));

  const rest: SubRow[] = [];
  for (const sub of ending) {
    const tg = sub.user ? Number(sub.user.telegram_id) : null;
    if (tg !== null && partnerIds.has(tg)) {
      if (await grantPartnerPremium(admin, tg).catch(() => false)) renewedPartners++;
    } else {
      rest.push(sub);
    }
  }

  // 2. Скоро закончится — напоминаем один раз на каждый срок подписки.
  const upcoming = rest.filter((s) => new Date(s.current_period_end) > now);
  if (upcoming.length > 0) {
    const { data: already } = await admin
      .from("notifications")
      .select("payload")
      .eq("type", "subscription_expiring")
      .in(
        "user_id",
        upcoming.map((s) => s.user_id)
      );
    const sentKeys = new Set(
      (already ?? []).map((n) => {
        const p = n.payload as { subscriptionId?: string; periodEnd?: string } | null;
        return `${p?.subscriptionId}:${p?.periodEnd}`;
      })
    );
    for (const sub of upcoming) {
      const key = `${sub.id}:${sub.current_period_end}`;
      if (sentKeys.has(key)) continue;
      await admin.from("notifications").insert({
        user_id: sub.user_id,
        type: "subscription_expiring",
        payload: { subscriptionId: sub.id, periodEnd: sub.current_period_end },
      });
      if (sub.user) {
        await api
          .sendMessage(
            Number(sub.user.telegram_id),
            `⏳ Подписка «${PLAN_TITLE[sub.plan]}» действует до ${formatDate(sub.current_period_end)}.\n` +
              `Продли заранее, чтобы не потерять доступ к встречам и откликам.`,
            { reply_markup: renewKeyboard() }
          )
          .catch((err) => console.error("subscription reminder failed", err));
      }
      reminded++;
    }
  }

  // 3. Срок прошёл — выключаем. Условие на статус защищает от двойной
  //    обработки при параллельных запусках.
  const overdue = rest.filter((s) => new Date(s.current_period_end) <= now);
  for (const sub of overdue) {
    const { data: updated } = await admin
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("id", sub.id)
      .eq("status", "active")
      .select("id");
    if (!updated || updated.length === 0) continue;
    expired++;
    await admin.from("notifications").insert({
      user_id: sub.user_id,
      type: "subscription_expired",
      payload: { subscriptionId: sub.id },
    });
    if (sub.user) {
      await api
        .sendMessage(
          Number(sub.user.telegram_id),
          `Подписка «${PLAN_TITLE[sub.plan]}» закончилась. Продли её, чтобы снова создавать встречи и откликаться без ограничений 🧡`,
          { reply_markup: renewKeyboard() }
        )
        .catch((err) => console.error("subscription expired notice failed", err));
    }
  }

  return { renewedPartners, reminded, expired };
}
