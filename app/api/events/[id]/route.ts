import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { getActiveSubscriptionInfo } from "@/lib/subscriptions/server";
import { uploadEventPhoto } from "@/lib/photos/upload-event-photo";

/**
 * GET /api/events/[id]
 * Полная информация о встрече для экрана "Детали встречи" — открывается
 * по клику на карточку в ленте или на маркер на карте.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { id: eventId } = params;
  const currentUser = await getCurrentUser();
  const admin = createAdminClient();

  const { data: event, error } = await admin
    .from("events")
    .select(
      `
      id, title, description, city, latitude, longitude, place_name, address,
      event_date, event_time, event_end_time, seats_total, seats_taken, status, organizer_id,
      cost_type, is_business, business_pricing_type, business_pricing_details, has_chat, photo_url,
      category:categories(slug, name, emoji),
      training_type:training_types(slug, name, emoji),
      organizer:users(id, name, avatar_url, birth_date, rating_avg, completed_meetings_count)
      `
    )
    .eq("id", eventId)
    .maybeSingle();

  if (error || !event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const organizerRow = event.organizer as unknown as {
    id: string;
    name: string;
    avatar_url: string | null;
    birth_date: string;
    rating_avg: number;
    completed_meetings_count: number;
  } | null;

  const { data: memberRows } = await admin
    .from("event_members")
    .select("role, user:users(id, name, avatar_url)")
    .eq("event_id", eventId)
    .eq("role", "participant");

  const participants = (memberRows ?? []).map((m) => {
    const user = m.user as unknown as { id: string; name: string; avatar_url: string | null };
    return { id: user.id, name: user.name, avatarUrl: user.avatar_url };
  });

  let viewerStatus: "organizer" | "accepted" | "pending" | "rejected" | "none" = "none";
  if (currentUser) {
    if (event.organizer_id === currentUser.userId) {
      viewerStatus = "organizer";
    } else {
      const { data: application } = await admin
        .from("applications")
        .select("status")
        .eq("event_id", eventId)
        .eq("user_id", currentUser.userId)
        .maybeSingle();
      if (application?.status === "accepted") viewerStatus = "accepted";
      else if (application?.status === "pending") viewerStatus = "pending";
      else if (application?.status === "rejected") viewerStatus = "rejected";
    }
  }

  return NextResponse.json({
    id: event.id,
    title: event.title,
    description: event.description,
    category: event.category,
    trainingType: event.training_type,
    city: event.city,
    placeName: event.place_name,
    address: event.address,
    latitude: event.latitude,
    longitude: event.longitude,
    eventDate: event.event_date,
    eventTime: event.event_time,
    eventEndTime: event.event_end_time,
    seatsTotal: event.seats_total,
    seatsTaken: event.seats_taken,
    status: event.status,
    costType: event.cost_type,
    isBusiness: event.is_business,
    businessPricingType: event.business_pricing_type,
    businessPricingDetails: event.business_pricing_details,
    hasChat: event.has_chat,
    photoUrl: event.photo_url,
    organizer: organizerRow
      ? {
          id: organizerRow.id,
          name: organizerRow.name,
          avatarUrl: organizerRow.avatar_url,
          age: calculateAge(organizerRow.birth_date),
          ratingAvg: organizerRow.rating_avg,
          completedMeetingsCount: organizerRow.completed_meetings_count,
        }
      : null,
    participants,
    viewerStatus,
  });
}

function calculateAge(birthDateIso: string): number {
  const birthDate = new Date(birthDateIso);
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

/**
 * PATCH /api/events/[id]
 * Body: { action: "cancel" } — отмена своей встречи (как раньше).
 * Body: { action: "update", ...поля }  — редактирование организатором
 * (см. запрос пользователя, ТЗ "редактирование собственного события").
 * И в том, и в другом случае владелец события ПРОВЕРЯЕТСЯ НА СЕРВЕРЕ —
 * это единственная надёжная проверка, фронтенд лишь скрывает кнопку.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { id: eventId } = params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("id, organizer_id, status, seats_taken, is_business, category:categories(slug)")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // ВАЖНО: владелец проверяется здесь, на сервере — не полагаемся на то,
  // что кнопка редактирования на фронтенде видна только организатору
  // (см. явное требование ТЗ: "нельзя разрешать редактирование только
  // через фронтенд-проверку").
  if (event.organizer_id !== currentUser.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (body?.action === "cancel") {
    if (event.status !== "published" && event.status !== "closed") {
      return NextResponse.json({ error: "cannot_cancel" }, { status: 422 });
    }

    await admin.from("events").update({ status: "cancelled" }).eq("id", eventId);

    const subscriptionInfo = await getActiveSubscriptionInfo(admin, currentUser.userId);
    if (subscriptionInfo) {
      await admin.rpc("decrement_subscription_usage_field", {
        p_subscription_id: subscriptionInfo.subscriptionId,
        p_period_start: subscriptionInfo.currentPeriodStart,
        p_field: "events_created_count",
      });
    }

    return NextResponse.json({ status: "cancelled" });
  }

  if (body?.action === "update") {
    if (event.status !== "published" && event.status !== "closed") {
      return NextResponse.json(
        { error: "cannot_edit", message: "Эту встречу уже нельзя изменить — она прошла или отменена." },
        { status: 422 }
      );
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const placeName = typeof body.placeName === "string" ? body.placeName.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const latitude = typeof body.latitude === "number" ? body.latitude : null;
    const longitude = typeof body.longitude === "number" ? body.longitude : null;
    const eventDate = typeof body.eventDate === "string" ? body.eventDate : "";
    const eventTime = typeof body.eventTime === "string" ? body.eventTime : "";
    const eventEndTime = typeof body.eventEndTime === "string" ? body.eventEndTime : "";
    const seatsTotal = Number(body.seatsTotal);

    // Конкретная причина вместо общего invalid_input — чтобы человек видел,
    // что именно исправить.
    const invalid = (field: string, message: string) =>
      NextResponse.json({ error: "invalid_input", field, message }, { status: 422 });
    if (!title) return invalid("title", "Добавь название встречи.");
    if (!placeName) return invalid("placeName", "Укажи место встречи.");
    if (latitude === null || longitude === null) return invalid("placeName", "Отметь место встречи на карте.");
    if (!eventDate) return invalid("eventDate", "Выбери дату встречи.");
    if (!eventTime || !eventEndTime) return invalid("eventTime", "Укажи время начала и окончания.");
    if (!Number.isFinite(seatsTotal) || seatsTotal < 2) {
      return invalid("seatsTotal", "В событии должно быть минимум 2 участника.");
    }

    // Нельзя установить лимит меньше уже подтверждённых участников — см.
    // явное требование ТЗ.
    if (seatsTotal < event.seats_taken) {
      return NextResponse.json(
        {
          error: "seats_below_taken",
          seatsTaken: event.seats_taken,
          field: "seatsTotal",
          message: `Нельзя поставить меньше ${event.seats_taken} — столько человек уже подтверждено.`,
        },
        { status: 422 }
      );
    }

    const updatePayload: Record<string, unknown> = {
      title,
      description: description || null,
      place_name: placeName,
      address: address || null,
      latitude,
      longitude,
      event_date: eventDate,
      event_time: eventTime,
      event_end_time: eventEndTime,
      seats_total: seatsTotal,
    };

    // Категорию можно менять только для НЕ бизнес-событий (у "Для бизнеса"
    // всегда служебная категория "custom", это не то, что показывается
    // пользователю как "категория" в форме).
    if (!event.is_business && typeof body.categorySlug === "string") {
      const { data: category } = await admin
        .from("categories")
        .select("id")
        .eq("slug", body.categorySlug)
        .maybeSingle();
      if (!category) return NextResponse.json({ error: "invalid_category" }, { status: 422 });
      updatePayload.category_id = category.id;

      if (body.categorySlug === "training") {
        if (typeof body.trainingTypeSlug !== "string") {
          return NextResponse.json({ error: "training_type_required" }, { status: 422 });
        }
        const { data: trainingType } = await admin
          .from("training_types")
          .select("id")
          .eq("slug", body.trainingTypeSlug)
          .maybeSingle();
        if (!trainingType) return NextResponse.json({ error: "invalid_training_type" }, { status: 422 });
        updatePayload.training_type_id = trainingType.id;
      } else {
        updatePayload.training_type_id = null;
      }
    }

    if (event.is_business) {
      if (typeof body.businessPricingType === "string") {
        updatePayload.business_pricing_type = body.businessPricingType;
      }
      if (typeof body.businessPricingDetails === "string") {
        updatePayload.business_pricing_details = body.businessPricingDetails.trim() || null;
      }
    } else if (typeof body.costType === "string") {
      updatePayload.cost_type = body.costType;
    }

    // Фото — только если реально прислали новое (пусто/не передано =
    // оставляем текущее как есть).
    if (typeof body.photoBase64 === "string" && body.photoBase64) {
      const photoResult = await uploadEventPhoto(admin, eventId, body.photoBase64);
      if (!photoResult.ok) {
        return NextResponse.json({ error: photoResult.error }, { status: 422 });
      }
      updatePayload.photo_url = photoResult.publicUrl;
    }

    // Существенные изменения (дата/время/место) — уведомляем участников в
    // чате встречи, см. явное требование ТЗ. Сравниваем со СТАРЫМИ
    // значениями, полученными ДО этого запроса.
    const { data: beforeRow } = await admin
      .from("events")
      .select("event_date, event_time, event_end_time, place_name")
      .eq("id", eventId)
      .maybeSingle();

    const { error: updateError } = await admin.from("events").update(updatePayload).eq("id", eventId);
    if (updateError) return NextResponse.json({ error: "update_failed" }, { status: 500 });

    const significantChange =
      beforeRow &&
      (beforeRow.event_date !== eventDate ||
        beforeRow.event_time !== eventTime ||
        beforeRow.event_end_time !== eventEndTime ||
        beforeRow.place_name !== placeName);

    if (significantChange) {
      await notifyParticipantsOfChange(admin, eventId, {
        eventDate,
        eventTime,
        eventEndTime,
        placeName,
        dateChanged: beforeRow!.event_date !== eventDate,
        timeChanged: beforeRow!.event_time !== eventTime || beforeRow!.event_end_time !== eventEndTime,
        placeChanged: beforeRow!.place_name !== placeName,
      });
    }

    return NextResponse.json({ status: "updated" });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}

/**
 * Уведомление участников об изменении существенных деталей встречи —
 * системным сообщением в общий чат события (если он есть) + push в
 * Telegram каждому, у кого нет доступа к чату (has_chat=false, большая
 * группа "Для бизнеса", см. ТЗ создания события).
 */
async function notifyParticipantsOfChange(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  change: {
    eventDate: string;
    eventTime: string;
    eventEndTime: string;
    placeName: string;
    dateChanged: boolean;
    timeChanged: boolean;
    placeChanged: boolean;
  }
) {
  const dateLabel = new Date(`${change.eventDate}T00:00:00Z`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const parts = ["Организатор изменил детали события."];
  if (change.dateChanged || change.timeChanged) {
    parts.push(`Новое время: ${dateLabel}, ${change.eventTime}–${change.eventEndTime}`);
  }
  if (change.placeChanged) {
    parts.push(`Новое место: ${change.placeName}`);
  }
  const text = parts.join("\n");

  const { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  const { data: memberRows } = await admin
    .from("event_members")
    .select("user_id, users(telegram_id)")
    .eq("event_id", eventId)
    .eq("role", "participant");

  if (conversation) {
    const { data: event } = await admin.from("events").select("organizer_id").eq("id", eventId).maybeSingle();
    if (event) {
      await admin.from("messages").insert({
        conversation_id: conversation.id,
        sender_id: event.organizer_id,
        content: text,
      });
      await admin.rpc("increment_conversation_unread", {
        p_conversation_id: conversation.id,
        p_exclude_user_id: event.organizer_id,
      });
    }
  } else {
    // Без общего чата (большая группа "Для бизнеса") — просто push каждому.
    const { notifyTelegram } = await import("@/lib/telegram/notify");
    await Promise.allSettled(
      (memberRows ?? []).map((m) => {
        const telegramId = (m.users as unknown as { telegram_id: number } | null)?.telegram_id;
        return telegramId ? notifyTelegram(telegramId, text) : Promise.resolve();
      })
    );
  }
}
