import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processTicketRefund, type RefundOrder } from "@/lib/payments/ticket-refund";

import { verifySandboxPayments } from "@/lib/payments/ticket-test-sweep";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== "Bearer " + process.env.CRON_SECRET)
    return NextResponse.json({error:"unauthorized"},{status:401});
  const db = createAdminClient({noStore:true});
  const jobs = await db.rpc("claim_ticket_refund_work",{p_limit:12});
  if (jobs.error) return NextResponse.json({error:"queue_unavailable"},{status:503});
  const orders = jobs.data as RefundOrder[];
  let failed = 0;
  for (let i=0;i<orders.length;i+=4) {
    const results = await Promise.allSettled(orders.slice(i,i+4).map(order => processTicketRefund(db,order)));
    failed += results.filter(result => result.status === "rejected").length;
  }
  const processed = orders.length - failed;
  if (process.env.TICKET_SANDBOX === "1") {
    try { failed += await verifySandboxPayments(db); }
    catch { return NextResponse.json({error:"sandbox_payment_queue_unavailable"},{status:503}); }
  }
  return NextResponse.json({processed,failed},{status:failed ? 503 : 200});
}
