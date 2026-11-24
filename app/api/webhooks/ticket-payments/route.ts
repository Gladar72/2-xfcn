import { fetchTicketRefund } from "@/lib/payments/ticket-refund";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkTestReceipt } from "@/lib/payments/ticket-receipt";
import { reconcileTicket } from "@/lib/payments/ticket-checkout";

const notification = z.object({
  type: z.literal("notification"), event: z.enum(["payment.succeeded", "payment.canceled"]),
  object: z.object({ id: z.string().uuid(), metadata: z.object({ ticket_order: z.string().uuid(), ticket_attempt: z.string().uuid() }) }),
});
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const refundNotice = z.object({type:z.literal("notification"),event:z.literal("refund.succeeded"),
    object:z.object({id:z.string().uuid(),payment_id:z.string().uuid()})}).safeParse(body);
  if (refundNotice.success) {
    const db = createAdminClient({noStore:true});
    const notice = refundNotice.data.object;
    const order = await db.from("ticket_orders").select("*").eq("provider_id",notice.payment_id)
      .in("state",["refund_pending","refund_review"]).maybeSingle();
    if (order.error) return NextResponse.json({error:"retry"},{status:503});
    if (!order.data || (order.data.refund_id && order.data.refund_id !== notice.id)) return NextResponse.json({status:"ignored"});
    try {
      const verified = await fetchTicketRefund({...order.data,refund_id:notice.id});
      const applied = await db.rpc("apply_ticket_refund",{p_order:order.data.id,p_refund:verified.id,
        p_payment:verified.payment_id,p_amount:order.data.price_kopecks,p_status:verified.status});
      if (applied.error) throw new Error("save_failed");
      return NextResponse.json({status:applied.data});
    } catch {return NextResponse.json({error:"verification_failed"},{status:503});}
  }
  const event = notification.safeParse(body);
  if (!event.success) return NextResponse.json({ status: "ignored" });
  const { id, metadata } = event.data.object;
  const db = createAdminClient({ noStore: true });
  const order = await db.from("ticket_orders").select("*").eq("id", metadata.ticket_order)
    .eq("attempt_id", metadata.ticket_attempt).maybeSingle();
  if (order.error) return NextResponse.json({ error: "retry" }, { status: 503 });
  if (!order.data || (order.data.provider_id && order.data.provider_id !== id)) return NextResponse.json({ status: "ignored" });
  try {
    const result = await reconcileTicket(db, order.data, id);
    if (result.state === "paid" && !await checkTestReceipt(db, order.data.id))
      return NextResponse.json({ status: "receipt_pending" }, { status: 503 });
    return NextResponse.json({ status: result.state });
  } catch {
    return NextResponse.json({ error: "verification_failed" }, { status: 503 });
  }
}
