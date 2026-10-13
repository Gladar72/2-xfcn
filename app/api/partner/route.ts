import { NextRequest, NextResponse } from "next/server";
import { InlineKeyboard } from "grammy";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import {
  REFERRAL_RATE,
  appReferralLink,
  applyForPartnership,
  getPartnerByUserId,
  getPartnerStats,
  savePayoutDetails,
  type ReferralPartner,
} from "@/lib/subscriptions/referrals";

function adminTelegramId(): number | null {
  const raw = (process.env.ADMIN_TELEGRAM_IDS ?? "").split(",")[0]?.trim();
  return raw && !Number.isNaN(Number(raw)) ? Number(raw) : null;
}

async function partnerView(admin: ReturnType<typeof createAdminClient>, partner: ReferralPartner | null) {
  if (!partner) return { status: "none" as const, rate: REFERRAL_RATE };
  const base = { status: partner.status, rate: REFERRAL_RATE, payoutDetails: partner.payout_details };
  if (partner.status !== "approved") return base;
  const stats = await getPartnerStats(admin, partner.id);
  return { ...base, code: partner.code, link: appReferralLink(partner.code), stats };
}

/** GET /api/partner — партнёрская программа: статус заявки, ссылка, статистика. */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const partner = await getPartnerByUserId(admin, currentUser.userId);
  return NextResponse.json(await partnerView(admin, partner));
}

/** POST /api/partner — подать заявку. Админу в Telegram уходят кнопки «Одобрить / Отклонить». */
export async function POST() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: user } = await admin
    .from("users")
    .select("name, telegram_id, telegram_username, phone, email")
    .eq("id", currentUser.userId)
    .maybeSingle();
  const { partner, created } = await applyForPartnership(admin, {
    userId: currentUser.userId,
    telegramId: (user?.telegram_id as number | null) ?? null,
    username: (user?.telegram_username as string | null) ?? null,
    firstName: (user?.name as string | null) ?? null,
  });
  const adminId = adminTelegramId();
  if (created && adminId) {
    const contact = user?.telegram_username ? `@${user.telegram_username}` : (user?.phone as string | null) ?? (user?.email as string | null) ?? "";
    await getBot()
      .api.sendMessage(adminId, `🤝 Новая заявка в партнёрскую программу (из приложения):\n${user?.name ?? "Без имени"}${contact ? ` (${contact})` : ""}`, {
        reply_markup: new InlineKeyboard().text("✅ Одобрить", `ref_approve:${partner.id}`).text("❌ Отклонить", `ref_reject:${partner.id}`),
      })
      .catch((err) => console.error("partner apply: не удалось отправить админу", err));
  }
  return NextResponse.json(await partnerView(admin, partner));
}

/** PATCH /api/partner { payoutDetails } — реквизиты для выплат (СБП/карта, ФИО). */
export async function PATCH(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const details = typeof body?.payoutDetails === "string" ? body.payoutDetails.trim() : "";
  if (details.length < 5) return NextResponse.json({ error: "invalid_details", message: "Укажи телефон для СБП и банк (или номер карты) и ФИО" }, { status: 422 });
  const admin = createAdminClient();
  const partner = await getPartnerByUserId(admin, currentUser.userId);
  if (!partner || partner.status !== "approved") return NextResponse.json({ error: "not_partner" }, { status: 403 });
  await savePayoutDetails(admin, partner.id, details);
  return NextResponse.json(await partnerView(admin, { ...partner, payout_details: details.slice(0, 500) }));
}
