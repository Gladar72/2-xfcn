import { z } from "zod";
import type { createAdminClient } from "@/lib/supabase/admin";
import { ticketProviderRequest } from "./ticket-checkout";
import { checkTestReceipt } from "./ticket-receipt";

type Db = ReturnType<typeof createAdminClient>;
export interface RefundOrder {
  id: string; state: string; price_kopecks: number; provider_id: string;
  refund_key: string; refund_id: string | null; refund_first_attempt: string;
  receipt_number: string | null;
}
const refundResponse = z.object({
  id: z.string().uuid(), payment_id: z.string().uuid(),
  amount: z.object({value:z.string(),currency:z.literal("RUB")}),
  status: z.enum(["succeeded","pending","canceled"]),
});

export async function fetchTicketRefund(order: RefundOrder) {
  const paymentId = z.string().uuid().parse(order.provider_id);
  const amount = (order.price_kopecks / 100).toFixed(2);
  let refundId = order.refund_id;
  if (!refundId && Date.now() - Date.parse(order.refund_first_attempt) > 23 * 3600_000) {
    // The POST idempotency key expires. Recover an existing full refund, never send a second POST.
    const list = await ticketProviderRequest("refunds?payment_id=" + paymentId);
    const matches = z.array(refundResponse).parse(list.items).filter(r => r.payment_id === paymentId && r.amount.value === amount);
    if (matches.length !== 1) throw new Error("refund_needs_reconciliation");
    refundId = matches[0]!.id;
  }
  const response = refundId
    ? await ticketProviderRequest("refunds/" + z.string().uuid().parse(refundId))
    : await ticketProviderRequest("refunds", {method:"POST",headers:{"Idempotence-Key":order.refund_key},
        body:JSON.stringify({payment_id:paymentId,amount:{value:amount,currency:"RUB"},description:"Возврат билета МЕСТО"})});
  const refund = refundResponse.parse(response);
  if (refund.payment_id !== paymentId || refund.amount.value !== amount || (refundId && refundId !== refund.id))
    throw new Error("ticket_refund_mismatch");
  return refund;
}

export async function processTicketRefund(db: Db, order: RefundOrder) {
  let state = order.state;
  if (state === "refund_pending") {
    const refund = await fetchTicketRefund(order);
    const saved = await db.rpc("apply_ticket_refund", {p_order:order.id,p_refund:refund.id,p_payment:refund.payment_id,
      p_amount:order.price_kopecks,p_status:refund.status});
    if (saved.error) throw new Error("refund_save_failed");
    state = saved.data;
  }
  if (state === "refunded" && (order.receipt_number || await checkTestReceipt(db,order.id)))
    await checkTestReceipt(db,order.id,"sell_refund");
  return state;
}
