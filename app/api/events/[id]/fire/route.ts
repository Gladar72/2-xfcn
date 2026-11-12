import { NextResponse } from "next/server";
import { InlineKeyboard } from "grammy";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { sendPushPersonal } from "@/lib/push/expo";
import { runInBackground } from "@/lib/server/background";
import { isBlocked } from "@/lib/likes";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/;
/** Организатору — не чаще одного сообщения про огоньки на событие за это время. */
const NOTIFY_GAP_MS = 15 * 60_000;

/**
 * «Огонёк» на событии: человек отмечает, что событие классное (даже если не идёт).
 * POST   /api/events/[id]/fire — поставить; DELETE — убрать. Ответ: { fired, count }.
 * Организатору приходит сообщение в Telegram (и push), не чаще раза в 15 минут на событие.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const eventId = params.id;
  if (!UUID.test(eventId)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const admin = createAdminClient();

  const { data: ev } = await admin.from("events").select("id, title, organizer_id, status, fire_count").eq("id", eventId).maybeSingle();
  if (!ev || ev.status === "cancelled") return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Последний огонёк до этого — чтобы не засыпать организатора сообщениями.
  const { data: last } = await admin
    .from("event_fires")
    .select("created_at")
    .eq("event_id", eventId)
    .neq("user_id", ev.organizer_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error, data: ins } = await admin
    .from("event_fires")
    .upsert({ event_id: eventId, user_id: me.userId }, { onConflict: "event_id,user_id", ignoreDuplicates: true })
    .select("event_id");
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  const added = (ins?.length ?? 0) > 0;

  const { data: after } = await admin.from("events").select("fire_count").eq("id", eventId).maybeSingle();
  const count = Number(after?.fire_count ?? ev.fire_count ?? 0);

  const quiet = last?.created_at && Date.now() - Date.parse(last.created_at as string) < NOTIFY_GAP_MS;
  if (added && ev.organizer_id !== me.userId && !quiet) {
    void runInBackground(async () => {
      if (!(await isBlocked(admin, me.userId, ev.organizer_id as string)))
        await notifyOrganizer(admin, ev.organizer_id as string, me.userId, eventId, String(ev.title ?? ""), count);
    });
  }
  return NextResponse.json({ fired: true, count });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const eventId = params.id;
  if (!UUID.test(eventId)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("event_fires").delete().eq("event_id", eventId).eq("user_id", me.userId);
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  const { data: after } = await admin.from("events").select("fire_count").eq("id", eventId).maybeSingle();
  return NextResponse.json({ fired: false, count: Number(after?.fire_count ?? 0) });
}

async function notifyOrganizer(
  admin: ReturnType<typeof createAdminClient>,
  organizerId: string,
  fromUserId: string,
  eventId: string,
  title: string,
  count: number
) {
  try {
    const [{ data: org }, { data: from }] = await Promise.all([
      admin.from("users").select("telegram_id").eq("id", organizerId).maybeSingle(),
      admin.from("users").select("name, gender").eq("id", fromUserId).maybeSingle(),
    ]);
    const name = (from?.name as string | null)?.trim() || "Кто-то";
    const put = from?.gender === "female" ? "поставила" : "поставил";
    const total = count > 1 ? `\nУже ${count} ${plural(count, "огонёк", "огонька", "огоньков")} 🔥` : "";
    const text = `🔥 ${name} ${put} огонёк на твоё событие «${title}»${total}`;
    const tg = org?.telegram_id as number | null | undefined;
    const appUrl = process.env.APP_URL;
    if (tg) {
      const kb = appUrl ? new InlineKeyboard().webApp("Открыть событие", `${appUrl}?goto=event_${eventId}`) : undefined;
      await getBot().api.sendMessage(tg, text, { reply_markup: kb }).catch(() => {});
    }
    await sendPushPersonal(admin, [
      { userId: organizerId, message: { title: `🔥 Огонёк на «${title}»`, body: `${name} ${put} огонёк${count > 1 ? ` · всего ${count}` : ""}`, data: { url: `/event/${eventId}`, type: "event_fire" } } },
    ]).catch(() => {});
  } catch (e) {
    console.error("fire notify:", e);
  }
}

function plural(n: number, one: string, few: string, many: string) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few;
  return many;
}
