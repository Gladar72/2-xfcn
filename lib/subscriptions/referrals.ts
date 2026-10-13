import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Партнёрская программа для блогеров (см. supabase/migrations/0032_referral_program.sql).
 * Здесь только работа с базой — тексты и кнопки живут в lib/telegram/bot.ts.
 */

type Admin = ReturnType<typeof createAdminClient>;

export const REFERRAL_RATE = 0.3;
export const REFERRAL_START_PREFIX = "ref_";

export interface ReferralPartner {
  id: string;
  /** null — партнёр из мобильного приложения без Telegram. */
  telegram_id: number | null;
  user_id: string | null;
  telegram_username: string | null;
  first_name: string | null;
  code: string;
  status: "pending" | "approved" | "rejected";
  payout_details: string | null;
  awaiting_payout_details: boolean;
}

const PARTNER_COLUMNS =
  "id, telegram_id, user_id, telegram_username, first_name, code, status, payout_details, awaiting_payout_details";

function generateCode(): string {
  // Без похожих символов (0/O, 1/l) — код иногда диктуют голосом.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export function referralLink(botUsername: string, code: string): string {
  return `https://t.me/${botUsername}?start=${REFERRAL_START_PREFIX}${code}`;
}

/** Ссылка партнёра для мобильного приложения: страница сайта /r/<code> (ведёт в приложение / магазин). */
export function appReferralLink(code: string): string {
  const base = (process.env.APP_URL || "https://mesto-go.ru").replace(/\/+$/, "");
  return `${base}/r/${code}`;
}

export function formatMoney(amount: number, currency: string): string {
  const value = Math.round(amount * 100) / 100;
  const text = value.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return currency === "XTR" ? `${text} ⭐` : `${text} ₽`;
}

export async function getPartnerByTelegramId(admin: Admin, telegramId: number): Promise<ReferralPartner | null> {
  const { data } = await admin.from("referral_partners").select(PARTNER_COLUMNS).eq("telegram_id", telegramId).maybeSingle();
  return (data as ReferralPartner | null) ?? null;
}

export async function getPartnerByUserId(admin: Admin, userId: string): Promise<ReferralPartner | null> {
  const { data } = await admin.from("referral_partners").select(PARTNER_COLUMNS).eq("user_id", userId).maybeSingle();
  if (data) return data as ReferralPartner;
  // Партнёр подавал заявку в боте — находим по telegram_id аккаунта и привязываем.
  const { data: user } = await admin.from("users").select("telegram_id").eq("id", userId).maybeSingle();
  if (!user?.telegram_id) return null;
  const byTg = await getPartnerByTelegramId(admin, Number(user.telegram_id));
  if (byTg && !byTg.user_id) {
    await admin.from("referral_partners").update({ user_id: userId }).eq("id", byTg.id);
    byTg.user_id = userId;
  }
  return byTg;
}

/**
 * Бот: партнёр по Telegram или по аккаунту приложения, к которому привязан этот
 * Telegram (заявку могли подать в приложении по телефону). Дописывает telegram_id.
 */
export async function getPartnerForTelegram(admin: Admin, telegramId: number): Promise<ReferralPartner | null> {
  const byTg = await getPartnerByTelegramId(admin, telegramId);
  if (byTg) return byTg;
  const { data: user } = await admin.from("users").select("id").eq("telegram_id", telegramId).maybeSingle();
  if (!user) return null;
  const { data } = await admin.from("referral_partners").select(PARTNER_COLUMNS).eq("user_id", user.id).maybeSingle();
  const partner = (data as ReferralPartner | null) ?? null;
  if (partner && !partner.telegram_id) {
    await admin.from("referral_partners").update({ telegram_id: telegramId }).eq("id", partner.id);
    partner.telegram_id = telegramId;
  }
  return partner;
}

export async function getPartnerById(admin: Admin, id: string): Promise<ReferralPartner | null> {
  const { data } = await admin.from("referral_partners").select(PARTNER_COLUMNS).eq("id", id).maybeSingle();
  return (data as ReferralPartner | null) ?? null;
}

/** Заявка на участие. Повторный вызов возвращает уже существующую запись. */
export async function applyForPartnership(
  admin: Admin,
  params: { telegramId?: number | null; userId?: string | null; username?: string | null; firstName?: string | null }
): Promise<{ partner: ReferralPartner; created: boolean }> {
  const findExisting = async () =>
    (params.userId ? await getPartnerByUserId(admin, params.userId) : null) ??
    (params.telegramId ? await getPartnerForTelegram(admin, params.telegramId) : null);
  const existing = await findExisting();
  if (existing) return { partner: existing, created: false };

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await admin
      .from("referral_partners")
      .insert({
        telegram_id: params.telegramId ?? null,
        user_id: params.userId ?? null,
        telegram_username: params.username ?? null,
        first_name: params.firstName ?? null,
        code: generateCode(),
      })
      .select(PARTNER_COLUMNS)
      .single();
    if (!error && data) return { partner: data as ReferralPartner, created: true };
    // 23505 — совпал код (или параллельная заявка того же человека): пробуем ещё раз.
    if (error?.code !== "23505") throw error;
    const raced = await findExisting();
    if (raced) return { partner: raced, created: false };
  }
  throw new Error("Не удалось сгенерировать уникальный реферальный код");
}

export async function setPartnerStatus(admin: Admin, partnerId: string, status: "approved" | "rejected") {
  await admin
    .from("referral_partners")
    .update({ status, approved_at: status === "approved" ? new Date().toISOString() : null })
    .eq("id", partnerId);
}

/** Сколько дней действует бесплатный Премиум партнёра (продлевается при каждом начислении). */
export const PARTNER_PREMIUM_DAYS = 365;

/**
 * Блогерам-партнёрам — бесплатный тариф «Премиум» (самый максимальный).
 * Если у человека уже есть подписка — тариф поднимается до Премиума, срок
 * продлевается минимум на PARTNER_PREMIUM_DAYS от сегодня (не сокращается);
 * если нет — создаётся. Человек ещё не зарегистрирован в приложении —
 * ничего не делаем: Премиум включится при регистрации (app/api/users).
 * Возвращает true, если Премиум включён.
 */
export async function grantPartnerPremium(admin: Admin, telegramId: number): Promise<boolean> {
  const { data: user } = await admin.from("users").select("id").eq("telegram_id", telegramId).maybeSingle();
  if (!user) return false;
  return grantPartnerPremiumToUser(admin, user.id as string);
}

/** Партнёр — по аккаунту: сначала user_id, иначе telegram_id. */
export async function grantPartnerPremiumForPartner(admin: Admin, partner: ReferralPartner): Promise<boolean> {
  if (partner.user_id) return grantPartnerPremiumToUser(admin, partner.user_id);
  if (partner.telegram_id) return grantPartnerPremium(admin, Number(partner.telegram_id));
  return false;
}

export async function grantPartnerPremiumToUser(admin: Admin, userId: string): Promise<boolean> {
  const user = { id: userId };
  const now = new Date();
  const minEnd = new Date(now.getTime() + PARTNER_PREMIUM_DAYS * 24 * 60 * 60 * 1000);

  const { data: existing } = await admin
    .from("subscriptions")
    .select("id, plan, current_period_end")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    const currentEnd = new Date(existing.current_period_end as string);
    const end = currentEnd > minEnd ? currentEnd : minEnd;
    await admin
      .from("subscriptions")
      .update({ plan: "premium", current_period_end: end.toISOString() })
      .eq("id", existing.id);
    return true;
  }

  const { error } = await admin.from("subscriptions").insert({
    user_id: user.id,
    plan: "premium",
    status: "active",
    current_period_start: now.toISOString(),
    current_period_end: minEnd.toISOString(),
  });
  return !error;
}

/** При регистрации в приложении: одобренный партнёр сразу получает Премиум. */
export async function grantPartnerPremiumIfPartner(admin: Admin, telegramId: number): Promise<boolean> {
  const { data: partner } = await admin
    .from("referral_partners")
    .select("status")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  if (partner?.status !== "approved") return false;
  return grantPartnerPremium(admin, telegramId);
}

/**
 * Переход по ссылке /start ref_<code>. Закрепляем человека за партнёром,
 * только если он ещё ни за кем не закреплён (первый переход решает) и это
 * не сам партнёр. Возвращает true, если закрепили сейчас.
 */
export async function recordReferralStart(admin: Admin, referredTelegramId: number, code: string): Promise<boolean> {
  const { data: partner } = await admin
    .from("referral_partners")
    .select("id, telegram_id, status")
    .eq("code", code.toLowerCase())
    .maybeSingle();
  if (!partner || partner.status !== "approved") return false;
  if (Number(partner.telegram_id) === referredTelegramId) return false;

  const { error } = await admin
    .from("referral_attributions")
    .insert({ referred_telegram_id: referredTelegramId, partner_id: partner.id });
  return !error; // 23505 = уже закреплён за кем-то — это нормально
}

/**
 * Мобильное приложение: человек ввёл код партнёра (или пришёл по ссылке /r/<code>).
 * Закрепляем, только если он ещё ни за кем не закреплён (ни по аккаунту, ни по
 * Telegram) и это не сам партнёр. Возвращает результат для показа пользователю.
 */
export async function recordReferralForUser(
  admin: Admin,
  userId: string,
  code: string
): Promise<"ok" | "not_found" | "self" | "already"> {
  const { data: partner } = await admin
    .from("referral_partners")
    .select("id, telegram_id, user_id, status")
    .eq("code", code.trim().toLowerCase())
    .maybeSingle();
  if (!partner || partner.status !== "approved") return "not_found";
  const { data: user } = await admin.from("users").select("telegram_id").eq("id", userId).maybeSingle();
  if (partner.user_id === userId || (user?.telegram_id && Number(partner.telegram_id) === Number(user.telegram_id))) return "self";
  if (user?.telegram_id) {
    const { data: tg } = await admin
      .from("referral_attributions")
      .select("partner_id")
      .eq("referred_telegram_id", user.telegram_id)
      .maybeSingle();
    if (tg) return "already";
  }
  const { error } = await admin.from("referral_user_attributions").insert({ referred_user_id: userId, partner_id: partner.id });
  return error ? "already" : "ok";
}

/** За каким партнёром закреплён человек: по аккаунту, иначе по Telegram. */
async function attributedPartnerId(admin: Admin, userId: string, telegramId: number | null): Promise<string | null> {
  const { data: byUser } = await admin.from("referral_user_attributions").select("partner_id").eq("referred_user_id", userId).maybeSingle();
  if (byUser) return byUser.partner_id as string;
  if (!telegramId) return null;
  const { data: byTg } = await admin.from("referral_attributions").select("partner_id").eq("referred_telegram_id", telegramId).maybeSingle();
  return (byTg?.partner_id as string | undefined) ?? null;
}

/**
 * Вызывается после КАЖДОЙ успешной оплаты подписки (Stars и ЮKassa).
 * Если плательщик пришёл по ссылке партнёра — начисляем 30%.
 * Идемпотентно: одна оплата = одно начисление (unique payment_id).
 * Никогда не бросает исключение — оплата не должна ломаться из-за рефералки.
 */
export async function recordReferralCommission(
  admin: Admin,
  params: { paymentId: string; userId: string; amount: number; currency: string },
  notify?: (telegramId: number, text: string) => Promise<unknown>
): Promise<void> {
  try {
    const { data: user } = await admin.from("users").select("telegram_id").eq("id", params.userId).maybeSingle();
    if (!user) return;

    const partnerId = await attributedPartnerId(admin, params.userId, (user.telegram_id as number | null) ?? null);
    if (!partnerId) return;

    const partner = await getPartnerById(admin, partnerId);
    if (!partner || partner.status !== "approved") return;

    const commission = Math.round(params.amount * REFERRAL_RATE * 100) / 100;
    const { error } = await admin.from("referral_commissions").insert({
      partner_id: partner.id,
      payment_id: params.paymentId,
      referred_telegram_id: user.telegram_id ?? null,
      referred_user_id: params.userId,
      payment_amount: params.amount,
      amount: commission,
      currency: params.currency,
      rate: REFERRAL_RATE,
    });
    if (error) {
      if (error.code !== "23505") console.error("recordReferralCommission insert failed:", error);
      return;
    }

    if (partner.user_id) {
      const { notifyUser } = await import("@/lib/notify/user");
      await notifyUser(admin, partner.user_id, {
        title: "Новая оплата по твоей ссылке",
        body: `Начислено +${formatMoney(commission, params.currency)} (30% от ${formatMoney(params.amount, params.currency)})`,
        url: "/partner",
      });
    }
    if (partner.telegram_id) await notify?.(
      Number(partner.telegram_id),
      `💰 Новая оплата по твоей ссылке!\nНачислено: +${formatMoney(commission, params.currency)} (30% от ${formatMoney(
        params.amount,
        params.currency
      )}).`
    );
  } catch (err) {
    console.error("recordReferralCommission failed:", err);
  }
}

export interface PartnerStats {
  joined: number; // перешли по ссылке
  registered: number; // из них зарегистрировались в приложении
  buyers: number; // оплатили хотя бы раз
  payments: number; // всего оплат
  earned: Record<string, number>; // всего начислено, по валютам
  available: Record<string, number>; // можно вывести
  requested: Record<string, number>; // ждут выплаты
  paid: Record<string, number>; // выплачено
}

export async function getPartnerStats(admin: Admin, partnerId: string): Promise<PartnerStats> {
  const [{ data: attributions }, { data: userAttributions }, { data: commissions }] = await Promise.all([
    admin.from("referral_attributions").select("referred_telegram_id").eq("partner_id", partnerId),
    admin.from("referral_user_attributions").select("referred_user_id").eq("partner_id", partnerId),
    admin
      .from("referral_commissions")
      .select("referred_telegram_id, referred_user_id, amount, currency, status")
      .eq("partner_id", partnerId),
  ]);

  const telegramIds = (attributions ?? []).map((a) => a.referred_telegram_id);
  let registered = 0;
  if (telegramIds.length > 0) {
    const { count } = await admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .in("telegram_id", telegramIds);
    registered = count ?? 0;
  }
  // Пришедшие через приложение уже зарегистрированы.
  const appJoined = (userAttributions ?? []).length;

  const stats: PartnerStats = {
    joined: telegramIds.length + appJoined,
    registered: registered + appJoined,
    buyers: new Set((commissions ?? []).map((c) => String(c.referred_user_id ?? c.referred_telegram_id))).size,
    payments: (commissions ?? []).length,
    earned: {},
    available: {},
    requested: {},
    paid: {},
  };
  for (const c of commissions ?? []) {
    const amount = Number(c.amount);
    const bucket = c.status === "accrued" ? stats.available : c.status === "requested" ? stats.requested : stats.paid;
    stats.earned[c.currency] = (stats.earned[c.currency] ?? 0) + amount;
    bucket[c.currency] = (bucket[c.currency] ?? 0) + amount;
  }
  return stats;
}

export function formatAmounts(byCurrency: Record<string, number>): string {
  const parts = Object.entries(byCurrency)
    .filter(([, v]) => v > 0)
    .map(([currency, v]) => formatMoney(v, currency));
  return parts.length ? parts.join(" + ") : "0 ₽";
}

/**
 * Запрос выплаты: все начисления со статусом accrued переводятся в
 * requested и привязываются к новой записи выплаты. Возвращает null,
 * если выводить нечего.
 */
export async function requestPayout(
  admin: Admin,
  partner: ReferralPartner
): Promise<{ payoutId: string; amountRub: number; amountStars: number } | null> {
  // Атомарно в БД (функция request_partner_payout): два параллельных запроса
  // не создадут две выплаты на одни и те же начисления.
  const { data, error } = await admin.rpc("request_partner_payout", { p_partner_id: partner.id, p_details: partner.payout_details });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { payout_id: string; amount_rub: number; amount_stars: number } | undefined;
  if (!row?.payout_id) return null;
  return { payoutId: row.payout_id, amountRub: Number(row.amount_rub), amountStars: Number(row.amount_stars) };
}

/** Админ отметил выплату как сделанную. Возвращает партнёра для уведомления. */
export async function markPayoutPaid(
  admin: Admin,
  payoutId: string
): Promise<{ partner: ReferralPartner; amountRub: number; amountStars: number } | null> {
  const { data: payout } = await admin
    .from("referral_payouts")
    .select("id, partner_id, amount_rub, amount_stars, status")
    .eq("id", payoutId)
    .maybeSingle();
  if (!payout || payout.status === "paid") return null;

  await admin.from("referral_payouts").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", payoutId);
  await admin.from("referral_commissions").update({ status: "paid" }).eq("payout_id", payoutId);

  const partner = await getPartnerById(admin, payout.partner_id);
  if (!partner) return null;
  return { partner, amountRub: Number(payout.amount_rub), amountStars: Number(payout.amount_stars) };
}

export async function savePayoutDetails(admin: Admin, partnerId: string, details: string) {
  await admin
    .from("referral_partners")
    .update({ payout_details: details.slice(0, 500), awaiting_payout_details: false })
    .eq("id", partnerId);
}

export async function setAwaitingPayoutDetails(admin: Admin, partnerId: string, value: boolean) {
  await admin.from("referral_partners").update({ awaiting_payout_details: value }).eq("id", partnerId);
}
