import { z } from "zod";
import type { createAdminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminClient>;
export interface TicketOrder {
  id: string; user_id: string; event_id: string; attempt_id: string;
  attempted_at: string; price_kopecks: number; buyer_email: string;
  checkout_method?: "bank_card" | "sbp" | null;
  provider_id: string | null; state: string; event_title: string;
}

const providerPayment = z.object({
  id: z.string().uuid(), test: z.boolean(), paid: z.boolean(),
  status: z.enum(["pending", "waiting_for_capture", "canceled", "succeeded"]),
  amount: z.object({ currency: z.literal("RUB"), value: z.string() }),
  metadata: z.object({ ticket_order: z.string().uuid(), ticket_attempt: z.string().uuid() }),
  confirmation: z.object({ confirmation_url: z.string().url().optional() }).nullish(),
});

function testAuthorization() {
  const shop = process.env.TICKET_TEST_SHOP_ID;
  const key = process.env.TICKET_TEST_SECRET_KEY;
  if (!shop || !key?.startsWith("test_")) throw new Error("ticket_shop_unavailable");
  return "Basic " + Buffer.from(shop + ":" + key).toString("base64");
}

export function ticketTestShopReady() {
  return !!process.env.TICKET_TEST_SHOP_ID && !!process.env.TICKET_TEST_SECRET_KEY?.startsWith("test_");
}

export async function ticketProviderRequest(path: string, init: RequestInit = {}) {
  const response = await fetch("https://api.yookassa.ru/v3/" + path, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: { ...init.headers, Authorization: testAuthorization(), "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("ticket_provider_unavailable");
  return response.json();
}

export async function reconcileTicket(db: Db, order: TicketOrder, notifiedId?: string) {
  if (order.state !== "pending") return { state: order.state, confirmationUrl: null };
  const knownId = order.provider_id ?? notifiedId;
  const amount = (order.price_kopecks / 100).toFixed(2);
  // YooKassa only guarantees idempotency for 24 hours. Never create a second
  // charge if the original response was lost and that window has elapsed.
  if (!knownId && Date.now() - Date.parse(order.attempted_at) > 23 * 3600_000)
    throw new Error("ticket_reconciliation_required");
  const origin = (process.env.APP_URL || "https://mesto-go.ru").replace(/\/$/, "");
  const payment = providerPayment.parse(knownId ? await ticketProviderRequest("payments/" + z.string().uuid().parse(knownId))
    : await ticketProviderRequest("payments", {
      method: "POST", headers: { "Idempotence-Key": order.attempt_id },
      body: JSON.stringify({
        amount: { value: amount, currency: "RUB" }, capture: true,
        description: ("Билет · " + order.event_title).slice(0, 128),
        ...(order.checkout_method && { payment_method_data: { type: order.checkout_method } }),
        confirmation: { type: "redirect", return_url: origin + "/e/" + order.event_id },
        metadata: { ticket_order: order.id, ticket_attempt: order.attempt_id },
      }),
    }));
  if (!payment.test || (knownId && knownId !== payment.id) || payment.amount.value !== amount ||
      payment.metadata.ticket_order !== order.id || payment.metadata.ticket_attempt !== order.attempt_id ||
      (payment.status === "succeeded" && !payment.paid)) throw new Error("ticket_payment_mismatch");
  const state = payment.status === "succeeded" ? "paid" : payment.status === "canceled" ? "canceled" : "pending";
  const url = payment.confirmation?.confirmation_url ?? null;
  if (url && new URL(url).protocol !== "https:") throw new Error("ticket_payment_mismatch");
  const { data, error } = await db.rpc("apply_ticket_payment", {
    p_order: order.id, p_attempt: order.attempt_id, p_payment: payment.id, p_amount: order.price_kopecks,
    p_state: state, p_url: url,
  });
  if (error) throw new Error("ticket_save_failed");
  return { state: data as string, confirmationUrl: data === "pending" ? url : null };
}
