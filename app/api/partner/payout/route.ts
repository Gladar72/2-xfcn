import { NextResponse } from "next/server";
import { InlineKeyboard } from "grammy";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { formatAmounts, getPartnerByUserId, requestPayout } from "@/lib/subscriptions/referrals";

/** POST /api/partner/payout — запросить выплату всей накопленной суммы. */
export async function POST() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const partner = await getPartnerByUserId(admin, currentUser.userId);
  if (!partner || partner.status !== "approved") return NextResponse.json({ error: "not_partner" }, { status: 403 });
  if (!partner.payout_details) {
    return NextResponse.json({ error: "no_details", message: "Сначала укажи реквизиты для выплат" }, { status: 422 });
  }
  const payout = await requestPayout(admin, partner);
  if (!payout) return NextResponse.json({ error: "nothing_to_pay", message: "Пока нечего выводить — начисления появятся после оплат по твоей ссылке" }, { status: 422 });

  const raw = (process.env.ADMIN_TELEGRAM_IDS ?? "").split(",")[0]?.trim();
  const adminId = raw && !Number.isNaN(Number(raw)) ? Number(raw) : null;
  const sum = formatAmounts({ RUB: payout.amountRub, XTR: payout.amountStars });
  if (adminId) {
    await getBot()
      .api.sendMessage(
        adminId,
        `💸 Запрос выплаты от партнёра ${partner.first_name ?? "Без имени"} (из приложения)\n\nСумма: ${sum}\nРеквизиты: ${partner.payout_details}`,
        { reply_markup: new InlineKeyboard().text("✅ Выплачено", `ref_paid:${payout.payoutId}`) }
      )
      .catch((err) => console.error("partner payout: не удалось отправить админу", err));
  }
  return NextResponse.json({ status: "requested", amount: sum });
}
