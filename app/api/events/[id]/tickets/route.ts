import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/events/[id]/tickets
 * Список билетов бизнес-события для организатора: кто, номер, пришёл ли.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("id, title, organizer_id, is_business, event_date, event_time, seats_total")
    .eq("id", params.id)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  if (event.organizer_id !== currentUser.userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: rows } = await admin
    .from("event_members")
    .select("ticket_code, checked_in_at, joined_at, user:users(id, name, avatar_url)")
    .eq("event_id", event.id)
    .eq("role", "participant")
    .order("joined_at", { ascending: true });

  const sale = await admin.from("ticket_sales").select("event_id").eq("event_id", event.id).maybeSingle();
  if (sale.error) return NextResponse.json({error: "ticket_unavailable"}, {status: 503});
  const tickets = (rows ?? []).map((r) => {
    const user = r.user as unknown as { id: string; name: string; avatar_url: string | null };
    return {
      userId: user.id,
      name: user.name,
      avatarUrl: user.avatar_url,
      ticketCode: r.ticket_code as string | null,
      checkedInAt: r.checked_in_at as string | null,
    };
  });

  return NextResponse.json({
    event: { id: event.id, title: event.title, eventDate: event.event_date, eventTime: event.event_time, isBusiness: event.is_business },
    onlineSales: !!sale.data, tickets,
  });
}

/**
 * PATCH /api/events/[id]/tickets
 * Body: { userId: string, checkedIn: boolean } — отметить / снять отметку «Пришёл».
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { userId?: unknown; qrToken?: unknown; checkedIn?: unknown } | null;
  if (!body || (typeof body.userId !== "string" && typeof body.qrToken !== "string") || typeof body.checkedIn !== "boolean") {
    return NextResponse.json({ error: "invalid_input", message: "Не удалось отметить билет." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("id, organizer_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  if (event.organizer_id !== currentUser.userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sale = await admin.from("ticket_sales").select("event_id").eq("event_id",event.id).maybeSingle();
  if (sale.error) return NextResponse.json({ error: "ticket_unavailable" }, { status: 503 });
  if (sale.data) {
    if (!body.checkedIn) return NextResponse.json({ error: "already_checked", message: "По этому билету гость уже прошёл." }, { status: 409 });
    const result = await admin.rpc("check_online_ticket", { p_event: event.id, p_host: currentUser.userId,
      p_user: body.userId ?? null, p_qr: body.qrToken ?? null });
    if (result.error || result.data?.state === "invalid") return NextResponse.json({ error: "invalid_ticket", message: "Билет не найден среди оплаченных билетов этого события." }, { status: 422 });
    if (result.data.state === "already_checked") return NextResponse.json({ error: "already_checked", message: "По этому билету гость уже прошёл." }, { status: 409 });
    return NextResponse.json(result.data);
  }
  if (typeof body.userId !== "string") return NextResponse.json({ error: "invalid_ticket" }, { status: 400 });
  const checkedInAt = body.checkedIn ? new Date().toISOString() : null;
  const { data: updated } = await admin
    .from("event_members")
    .update({ checked_in_at: checkedInAt })
    .eq("event_id", event.id)
    .eq("user_id", body.userId)
    .eq("role", "participant")
    .select("user_id");
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "not_a_member", message: "Этот человек больше не участник события." }, { status: 404 });
  }

  return NextResponse.json({ checkedInAt });
}
