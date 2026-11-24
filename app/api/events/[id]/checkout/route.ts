import { ticketContract, eventSchedule } from "@/lib/payments/ticket-terms";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileTicket, ticketTestShopReady } from "@/lib/payments/ticket-checkout";

export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createAdminClient({ noStore: true });
  const { data: existing, error } = await db.from("ticket_orders").select("*")
    .eq("event_id", params.id).eq("user_id", user.userId).maybeSingle();
  if (error) return NextResponse.json({ error: "checkout_unavailable" }, { status: 503 });
  if (!existing) return NextResponse.json({ error: "approval_required" }, { status: 403 });
  const body = await req.json().catch(() => null);
  let order = existing;
  if (body?.action === "pay") {
    if (!ticketTestShopReady()) return NextResponse.json({ error: "ticket_shop_unavailable", message: "Тестовый магазин ещё не подключён." }, { status: 503 });
    const email = z.string().trim().email().max(64).safeParse(body.email);
    if (!email.success || body.acceptedTerms !== true) return NextResponse.json({ error: "invalid_input", message: "Проверь почту и подтверди условия покупки." }, { status: 400 });
    const method = z.enum(["bank_card", "sbp"]).optional().safeParse(body.paymentMethod);
    if (!method.success) return NextResponse.json({ message: "Выбери карту или СБП." }, { status: 400 });
    const [event,sale] = await Promise.all([
      db.from("events").select("title,event_date,event_time,event_end_time,city,longitude,place_name,address,biz_category").eq("id",params.id).single(),
      db.from("ticket_sales").select("full_refund_before_start").eq("event_id",params.id).single(),
    ]);
    if (event.error || sale.error) return NextResponse.json({error:"unavailable"},{status:503});
    const full = sale.data.full_refund_before_start ?? event.data.biz_category === "party";
    const contract = ticketContract(event.data,existing,full);
    if (body.termsVersion !== contract.version) return NextResponse.json({message:"Условия обновились. Открой событие и прочитай договор ещё раз."},{status:409});
    const {title,place_name,address,biz_category,event_end_time} = event.data;
    const started = await db.rpc("accept_ticket_checkout",{p_method:method.data ?? null,p_event:params.id,p_user:user.userId,p_email:email.data,
      p_order_terms:existing.purchase_terms,p_terms:contract.text,p_full:full,p_start:contract.start,
      p_event_snapshot:{...eventSchedule(event.data),title,place_name,address,biz_category,event_end_time}});
    if (started.error || !started.data) return NextResponse.json({ error: "checkout_unavailable", message: "Сейчас нельзя начать оплату." }, { status: 409 });
    order = started.data;
  } else if (body?.action !== "status") return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  try {
    return NextResponse.json(await reconcileTicket(db, order));
  } catch {
    return NextResponse.json({ error: "verification_pending", message: "Пока не удалось проверить оплату. Проверь статус ещё раз." }, { status: 503 });
  }
}
