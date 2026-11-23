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
    const started = await db.rpc("start_ticket_attempt", { p_event: params.id, p_user: user.userId, p_email: email.data });
    if (started.error || !started.data) return NextResponse.json({ error: "checkout_unavailable", message: "Сейчас нельзя начать оплату." }, { status: 409 });
    order = started.data;
  } else if (body?.action !== "status") return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  try {
    return NextResponse.json(await reconcileTicket(db, order));
  } catch {
    return NextResponse.json({ error: "verification_pending", message: "Пока не удалось проверить оплату. Проверь статус ещё раз." }, { status: 503 });
  }
}
