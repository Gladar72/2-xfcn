import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ticketTestShopReady } from "@/lib/payments/ticket-checkout";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.TICKET_SANDBOX !== "1") return new Response(null, { status: 404 });
  const db = createAdminClient({ noStore: true });
  const { count, error } = await db.from("ticket_sales").select("event_id", { count: "exact", head: true })
    .in("event_id", ["5717f10a-0000-4000-8000-000000000011", "5717f10a-0000-4000-8000-000000000012"]);
  const ready = !error && count === 2 && ticketTestShopReady();
  return NextResponse.json({ environment: "ticket-test", ready, demoReceipts: !!process.env.ATOL_DEMO_PASSWORD },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
