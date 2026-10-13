import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { appleIapConfigured, getAppleSubscriptionState, getAppleTransaction } from "@/lib/payments/apple";
import { applyAppleState } from "@/lib/payments/apple-sync";

/**
 * POST /api/subscriptions/apple/verify  { transactionId }
 * iPhone после покупки (или «Восстановить покупки») присылает номер транзакции.
 * Проверяем его у Apple (App Store Server API), включаем тариф до даты окончания из App Store.
 * Ответ: { active, plan, expiresAt }.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!appleIapConfigured()) {
    return NextResponse.json({ error: "apple_not_configured", message: "Покупки в App Store пока не подключены" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const transactionId = typeof body?.transactionId === "string" ? body.transactionId.trim() : "";
  if (!/^\d{1,30}$/.test(transactionId)) {
    return NextResponse.json({ error: "invalid_input", message: "Не удалось проверить покупку" }, { status: 422 });
  }

  try {
    const txn = await getAppleTransaction(transactionId);
    if (!txn) return NextResponse.json({ error: "not_found", message: "Apple не нашёл такую покупку" }, { status: 404 });
    // Покупку делали из этого аккаунта (appAccountToken = id пользователя) — или токена нет (старые покупки).
    if (txn.appAccountToken && txn.appAccountToken.toLowerCase() !== user.userId.toLowerCase()) {
      return NextResponse.json(
        { error: "other_account", message: "Эта подписка оформлена из другого профиля «Места»" },
        { status: 409 }
      );
    }
    const state = await getAppleSubscriptionState(txn.originalTransactionId);
    if (!state) return NextResponse.json({ error: "not_found", message: "Apple не нашёл такую подписку" }, { status: 404 });

    const admin = createAdminClient();
    const r = await applyAppleState(admin, user.userId, state);
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.error === "other_account" ? 409 : 422 });
    return NextResponse.json({ active: r.active, plan: r.plan, expiresAt: r.expiresAt });
  } catch (e) {
    console.error("apple/verify:", e);
    return NextResponse.json({ error: "apple_unavailable", message: "Не удалось связаться с App Store — попробуй ещё раз" }, { status: 502 });
  }
}
