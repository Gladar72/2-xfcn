import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { handleRsvpAnswer } from "@/lib/telegram/event-reminders";

/**
 * POST /api/events/[id]/rsvp  { answer: "going" | "not_going" }
 *
 * Ответ на напоминание за 2 часа до встречи («Иду» / «Не смогу») из
 * мобильного приложения — та же логика, что и у кнопок под сообщением
 * бота (lib/telegram/bot.ts → handleRsvpAnswer): «Не смогу» убирает из
 * встречи и чата, освобождает место и сообщает организатору.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const raw = body?.answer;
  const answer = raw === "going" || raw === "y" ? "going" : raw === "not_going" || raw === "n" ? "not_going" : null;
  if (!answer) return NextResponse.json({ error: "invalid_answer" }, { status: 400 });

  const admin = createAdminClient();
  const { data: rsvp } = await admin
    .from("event_rsvps")
    .select("id")
    .eq("event_id", params.id)
    .eq("user_id", currentUser.userId)
    .maybeSingle();
  if (!rsvp) {
    return NextResponse.json({ error: "not_found", message: "Напоминания по этой встрече ещё не было" }, { status: 404 });
  }

  const result = await handleRsvpAnswer(admin, getBot().api, {
    rsvpId: rsvp.id as string,
    answer,
    fromUserId: currentUser.userId,
  });
  if (!result.ok) return NextResponse.json({ error: "rejected", message: result.text }, { status: 422 });
  return NextResponse.json({ status: result.answer, message: result.text });
}
