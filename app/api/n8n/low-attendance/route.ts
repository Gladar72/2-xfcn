import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidN8nRequest } from "@/lib/n8n/auth";

const LOOKAHEAD_HOURS = 24;
const LOW_ATTENDANCE_THRESHOLD = 0.5; // меньше половины мест занято

/**
 * GET /api/n8n/low-attendance
 *
 * Workflow 6 (п.27 ТЗ): "Встреча скоро начинается, но мало участников →
 * предложить организатору использовать boost". Подсказка отправляется
 * только один раз на встречу (idempotency через notifications).
 */
export async function GET(req: NextRequest) {
  if (!isValidN8nRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000);

  const { data: candidates } = await admin
    .from("events")
    .select("id, title, event_date, event_time, seats_total, seats_taken, organizer_id, users!events_organizer_id_fkey(telegram_id)")
    .eq("status", "published")
    .gte("event_date", now.toISOString().slice(0, 10))
    .lte("event_date", horizon.toISOString().slice(0, 10));

  const dueSoonLowAttendance = (candidates ?? []).filter((e) => {
    const dt = new Date(`${e.event_date}T${e.event_time}`);
    if (dt < now || dt > horizon) return false;
    return e.seats_taken / e.seats_total < LOW_ATTENDANCE_THRESHOLD;
  });

  if (dueSoonLowAttendance.length === 0) return NextResponse.json({ items: [] });

  const { data: alreadyNotified } = await admin
    .from("notifications")
    .select("payload")
    .eq("type", "boost_suggestion");
  const alreadyNotifiedEventIds = new Set(
    (alreadyNotified ?? []).map((n) => (n.payload as { eventId?: string } | null)?.eventId).filter(Boolean)
  );

  const items = dueSoonLowAttendance
    .filter((e) => !alreadyNotifiedEventIds.has(e.id))
    .map((e) => ({
      eventId: e.id,
      title: e.title,
      seatsTaken: e.seats_taken,
      seatsTotal: e.seats_total,
      organizerTelegramId: (e.users as unknown as { telegram_id: number } | null)?.telegram_id,
    }))
    .filter((item) => Boolean(item.organizerTelegramId));

  if (items.length > 0) {
    await admin.from("notifications").insert(
      dueSoonLowAttendance
        .filter((e) => items.some((i) => i.eventId === e.id))
        .map((e) => ({
          user_id: e.organizer_id,
          type: "boost_suggestion",
          payload: { eventId: e.id },
        }))
    );
  }

  return NextResponse.json({ items });
}
