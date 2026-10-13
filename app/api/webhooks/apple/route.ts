import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appleIapConfigured, getAppleSubscriptionState, getAppleTransaction, readAppleNotification } from "@/lib/payments/apple";
import { appleOwner, applyAppleState, markAppleRefund } from "@/lib/payments/apple-sync";

/**
 * POST /api/webhooks/apple — App Store Server Notifications V2
 * (продления, отмены, возвраты). Адрес указывается в App Store Connect → App → App Information.
 *
 * Телу не верим: берём из него только номера транзакций и сами спрашиваем
 * у Apple актуальное состояние (App Store Server API). Владельца определяем
 * только по данным, полученным от Apple.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const signed = typeof body?.signedPayload === "string" ? body.signedPayload : "";
  if (!signed || !appleIapConfigured()) return NextResponse.json({ status: "ignored" });

  let note;
  try {
    note = readAppleNotification(signed);
  } catch {
    return NextResponse.json({ status: "ignored" });
  }
  if (!note.originalTransactionId) return NextResponse.json({ status: "ignored", type: note.type });

  const admin = createAdminClient();
  try {
    // Возврат за конкретный (возможно, прошлый) период — перепроверяем именно эту транзакцию.
    if ((note.type === "REFUND" || note.type === "REVOKE") && note.transactionId) {
      const txn = await getAppleTransaction(note.transactionId);
      if (txn?.revocationDate) await markAppleRefund(admin, txn.transactionId);
    }

    const state = await getAppleSubscriptionState(note.originalTransactionId);
    if (!state) return NextResponse.json({ status: "unknown_subscription" });

    const userId = await appleOwner(admin, state.transaction);
    if (!userId) return NextResponse.json({ status: "unknown_user" });

    const r = await applyAppleState(admin, userId, state);
    return NextResponse.json({ status: r.ok ? "ok" : r.error, type: note.type });
  } catch (e) {
    console.error("webhooks/apple:", e);
    // 5xx — Apple повторит уведомление позже.
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
