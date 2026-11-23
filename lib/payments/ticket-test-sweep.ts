import type { createAdminClient } from "@/lib/supabase/admin";
import { reconcileTicket } from "./ticket-checkout";
import { checkTestReceipt } from "./ticket-receipt";

type Database = ReturnType<typeof createAdminClient>;

// The sandbox has one refund worker. Rotate through existing payments so a pending
// order never prevents a later guest's payment or receipt from being verified.
let cursor: string | null = null;

export async function verifySandboxPayments(db: Database) {
  const size = 8;
  let query = db.from("ticket_orders").select("*")
    .or("and(state.eq.pending,provider_id.not.is.null),and(state.eq.paid,receipt_number.is.null)")
    .order("id").limit(size);
  if (cursor) query = query.gt("id", cursor);
  const { data, error } = await query;
  if (error) throw new Error("sandbox_payment_queue_unavailable");
  cursor = data.length === size ? data[data.length - 1].id : null;
  const results = await Promise.allSettled(data.map(async order => {
    // Only a known provider ID is eligible here. This worker never starts a charge.
    const state = order.state === "pending" && order.provider_id
      ? (await reconcileTicket(db, order, order.provider_id)).state : order.state;
    if (state === "paid") await checkTestReceipt(db, order.id);
  }));
  return results.filter(result => result.status === "rejected").length;
}
