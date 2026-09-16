import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";
import { buildNotificationText } from "@/lib/notifications/text";
import { isAdminTelegramId } from "@/lib/admin/is-admin";
import { getActiveSubscriptionInfo } from "@/lib/subscriptions/server";
import { canApplyToMoreEvents, FREE_APPLICATIONS_LIMIT } from "@/lib/subscriptions/limits";

const APPLICATIONS_PERIOD_DAYS = 30;

/**
 * POST /api/applications
 * Body: { eventId: string }
 *
 * Отклик на встречу (кнопка "Хочу пойти", п.13 ТЗ). Лимит на КОЛИЧЕСТВО
 * откликов за 30 дней — свой для каждого тарифа (и отдельный
 * FREE_APPLICATIONS_LIMIT для тех, у кого нет подписки вообще), задаётся
 * в lib/subscriptions/limits.ts. Отдельно от лимита на СОЗДАНИЕ встреч.
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const eventId = body?.eventId as string | undefined;
  if (!eventId) return NextResponse.json({ error: "missing_event_id" }, { status: 400 });

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("id, title, organizer_id, status, seats_total, seats_taken")
    .eq("id", eventId)
    .maybeSingle();

  if (!event || event.status !== "published") {
    return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  }

  if (event.organizer_id === currentUser.userId) {
    return NextResponse.json({ error: "cannot_apply_to_own_event" }, { status: 422 });
  }

  if (event.seats_taken >= event.seats_total) {
    return NextResponse.json({ error: "event_full" }, { status: 409 });
  }

  const { data: blocked } = await admin.rpc("is_blocked_pair", {
    user_a: currentUser.userId,
    user_b: event.organizer_id,
  });
  if (blocked) {
    return NextResponse.json({ error: "blocked" }, { status: 403 });
  }

  if (!isAdminTelegramId(currentUser.telegramId)) {
    const subscriptionInfo = await getActiveSubscriptionInfo(admin, currentUser.userId);
    const periodStart = new Date(Date.now() - APPLICATIONS_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { count: applicationsUsedInPeriod } = await admin
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", currentUser.userId)
      .gte("created_at", periodStart);

    if (!canApplyToMoreEvents(subscriptionInfo?.plan ?? null, applicationsUsedInPeriod ?? 0)) {
      return NextResponse.json(
        {
          error: "applications_limit_reached",
          limit: subscriptionInfo ? undefined : FREE_APPLICATIONS_LIMIT,
        },
        { status: 403 }
      );
    }
  }

  const { data: application, error: insertError } = await admin
    .from("applications")
    .insert({ event_id: eventId, user_id: currentUser.userId, status: "pending" })
    .select("id")
    .single();

  if (insertError) {
    // unique constraint (event_id, user_id) — уже откликался
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "already_applied" }, { status: 409 });
    }
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  await admin.from("notifications").insert({
    user_id: event.organizer_id,
    type: "new_application",
    payload: { eventId, applicationId: application.id, applicantId: currentUser.userId },
  });

  const { data: organizer } = await admin
    .from("users")
    .select("telegram_id")
    .eq("id", event.organizer_id)
    .maybeSingle();
  if (organizer) {
    notifyTelegram(organizer.telegram_id, buildNotificationText("new_application", event.title)).catch(() => {});
  }

  return NextResponse.json({ status: "created", applicationId: application.id });
}
