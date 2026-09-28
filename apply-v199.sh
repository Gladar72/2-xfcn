mkdir -p "app/api/events/[id]"
cat > "app/api/events/[id]/route.ts" << 'FILE1_EOF'
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
      return NextResponse.json({ error: "cannot_edit" }, { status: 422 });
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

    if (
      !title ||
      !placeName ||
      latitude === null ||
      longitude === null ||
      !eventDate ||
      !eventTime ||
      !eventEndTime ||
      !Number.isFinite(seatsTotal) ||
      seatsTotal < 1
    ) {
      return NextResponse.json({ error: "invalid_input" }, { status: 422 });
    }

    // Нельзя установить лимит меньше уже подтверждённых участников — см.
    // явное требование ТЗ.
    if (seatsTotal < event.seats_taken) {
      return NextResponse.json({ error: "seats_below_taken", seatsTaken: event.seats_taken }, { status: 422 });
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
FILE1_EOF
mkdir -p "app/(app)/events/[id]"
cat > "app/(app)/events/[id]/page.tsx" << 'FILE2_EOF'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ApplicantCard, type ApplicantCardData } from "@/components/applications/ApplicantCard";
import { AvatarViewer } from "@/components/profile/AvatarViewer";
import "./mesto-event.css";

interface EventDetails {
  id: string;
  title: string;
  description: string | null;
  category: { slug: string; name: string; emoji: string | null } | null;
  trainingType: { slug: string; name: string; emoji: string | null } | null;
  placeName: string | null;
  address: string | null;
  eventDate: string;
  eventTime: string;
  eventEndTime: string | null;
  seatsTotal: number;
  seatsTaken: number;
  status: string;
  costType: string | null;
  isBusiness: boolean;
  businessPricingType: "ticket" | "free" | "custom" | null;
  businessPricingDetails: string | null;
  photoUrl: string | null;
  organizer: {
    id: string;
    name: string;
    avatarUrl: string | null;
    age: number;
    ratingAvg: number;
    completedMeetingsCount: number;
  } | null;
  participants: { id: string; name: string; avatarUrl: string | null }[];
  viewerStatus: "organizer" | "accepted" | "pending" | "rejected" | "none";
}

interface EventDetailsPageProps {
  // Next.js 14 (в этом проекте) — params плоский объект, НЕ Promise.
  // См. пояснение в app/chats/[id]/page.tsx про баг с use(params).
  params: { id: string };
}

const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/3d/workout.png",
  cinema: "/brand/3d/movie.png",
  coffee: "/brand/3d/coffee.png",
  breakfast: "/brand/3d/breakfast.png",
  dinner: "/brand/3d/dinner.png",
  walk: "/brand/3d/walk.png",
  custom: "/brand/3d/custom-proposal.png",
};

export default function EventDetailsPage({ params }: EventDetailsPageProps) {
  const { id: eventId } = params;
  const router = useRouter();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [boostMessage, setBoostMessage] = useState<string | null>(null);
  const [pendingApplicants, setPendingApplicants] = useState<ApplicantCardData[]>([]);
  const [processingApplicantId, setProcessingApplicantId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError("Встреча не найдена.");
          return;
        }
        setEvent(data);
        // Заявки на СВОЮ встречу показываем прямо здесь, сразу как только
        // организатор открыл событие — не нужно проваливаться ещё на один
        // экран "Управлять заявками", чтобы увидеть и принять новых людей.
        if (data.viewerStatus === "organizer") {
          loadPendingApplicants();
        }
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  function loadPendingApplicants() {
    fetch(`/api/events/${eventId}/applications`)
      .then((r) => r.json())
      .then((data) => {
        const items = (data.applications ?? []) as ApplicantCardData[];
        setPendingApplicants(items.filter((a) => a.status === "pending"));
      })
      .catch(() => {});
  }

  async function handleApplicantDecision(applicationId: string, action: "accept" | "reject") {
    setProcessingApplicantId(applicationId);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        loadPendingApplicants();
        // Обновляем и саму встречу — seatsTaken и статус (могла закрыться,
        // если это было последнее место).
        fetch(`/api/events/${eventId}`)
          .then((r) => r.json())
          .then((data) => !data.error && setEvent(data));
      }
    } finally {
      setProcessingApplicantId(null);
    }
  }

  async function handleApply() {
    setApplying(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "event_full"
            ? "Мест больше нет."
            : data.error === "cannot_apply_to_own_event"
              ? "Это твоя собственная встреча."
              : data.error === "applications_limit_reached"
                ? "Лимит откликов на встречи по твоему тарифу исчерпан за этот период — загляни в раздел «Подписка», чтобы поднять лимит."
                : "Не получилось отправить отклик."
        );
        return;
      }
      setEvent((prev) => (prev ? { ...prev, viewerStatus: "pending" } : prev));
    } finally {
      setApplying(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (res.ok) {
        setEvent((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
        setConfirmingCancel(false);
      } else {
        setError("Не получилось отменить встречу.");
      }
    } finally {
      setCancelling(false);
    }
  }

  async function handleBoost() {
    setBoosting(true);
    setBoostMessage(null);
    try {
      const res = await fetch("/api/boosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBoostMessage(
          data.error === "subscription_required"
            ? "Нужна подписка, чтобы поднимать встречи."
            : data.error === "boost_limit_reached"
              ? "Лимит подъёмов на этот месяц исчерпан."
              : "Не получилось поднять встречу."
        );
        return;
      }
      setBoostMessage(
        data.boostsLimit != null
          ? `Встреча поднята! Использовано ${data.boostsUsed} из ${data.boostsLimit} в этом месяце.`
          : "Встреча поднята!"
      );
    } finally {
      setBoosting(false);
      setTimeout(() => setBoostMessage(null), 4000);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-ink-600">Загрузка...</p>
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/feed" className="text-sm font-medium text-accent">
          Вернуться на главную
        </Link>
      </div>
    );
  }
  if (!event) return null;

  const categoryLabel = event.isBusiness ? "Бизнес событие" : event.trainingType?.name ?? event.category?.name;
  const categoryIcon = event.isBusiness ? "/brand/markers/marker-business.png" : event.category ? CATEGORY_ICON[event.category.slug] : undefined;
  const seatsLeft = event.seatsTotal - event.seatsTaken;
  const isFull = seatsLeft <= 0;

  // Строки для нового дизайна страницы («Акцент на фото», см.
  // MESTO_Photo_Focus_Kit) — те же данные, что и раньше, просто собраны
  // в отдельные подписи под конкретные плашки макета.
  const timeLabel = event.eventEndTime
    ? `${event.eventTime.slice(0, 5)}–${event.eventEndTime.slice(0, 5)}`
    : event.eventTime.slice(0, 5);
  const dateLabel = `${formatDate(event.eventDate)} · ${timeLabel}`;
  const addressLine = event.placeName ? `${event.placeName}${event.address ? `, ${event.address}` : ""}` : event.address ?? "";
  // Неразрывный пробел в "X из Y" — чтобы последняя цифра не переносилась
  // одна на новую строку на узком экране (см. ТЗ, п.3).
  const capacityLabel = isFull ? "Мест нет" : `${seatsLeft}\u00A0из\u00A0${event.seatsTotal}`;
  const priceLabel = event.isBusiness
    ? event.businessPricingType === "ticket"
      ? `Билет: ${event.businessPricingDetails}`
      : event.businessPricingType === "custom"
        ? event.businessPricingDetails ?? "Свои условия"
        : "Бесплатно"
    : event.costType
      ? { each_pays: "Каждый за себя", organizer_treats: "Автор угощает", free: "Бесплатно", negotiable: "По договорённости" }[
          event.costType
        ] ?? "—"
      : "—";
  // Фото есть только у "Для бизнеса" — у остальных категорий вместо
  // фотографии показываем крупную иконку категории на том же месте
  // (см. п.10 ТЗ — предусмотренный текущим проектом fallback).
  const heroPhotoSrc = event.photoUrl ?? categoryIcon ?? "/brand/3d/custom-proposal.png";
  const heroIsRealPhoto = !!event.photoUrl;
  const canManage = event.viewerStatus === "organizer" && (event.status === "published" || event.status === "closed");

  return (
    <div className="-mb-24">
      <div className="mesto">
        <main className="m-page">
          <div className="mb-3 flex items-center gap-3">
            <button onClick={() => router.back()} aria-label="Назад">
              <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
            </button>
          </div>

          {canManage && (
            <div className="mb-3 flex items-start gap-2 rounded-card-lg bg-[#F1EAFF] p-4">
              <span className="text-lg leading-none">👑</span>
              <div>
                <p className="text-sm font-semibold text-[color:var(--m-purple)]">Вы организатор этого события</p>
                <p className="mt-0.5 text-xs text-ink-600">Вы можете изменить информацию о событии в любой момент.</p>
              </div>
            </div>
          )}

          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="m-badge">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mesto/assets/icons/png/business.png" alt="" width={20} height={20} />
              <span>{categoryLabel}</span>
            </div>
            {canManage && (
              <Link
                href={`/events/${event.id}/edit`}
                className="flex shrink-0 items-center gap-1.5 rounded-pill bg-[#F1EAFF] px-4 py-2 text-sm font-medium text-[color:var(--m-purple)]"
              >
                ✏️ Редактировать
              </Link>
            )}
          </div>

          <h1 className="m-title">{event.title}</h1>

          <figure className="m-hero">
            <Image
              className="m-photo"
              src={heroPhotoSrc}
              alt=""
              width={480}
              height={343}
              style={heroIsRealPhoto ? undefined : { objectFit: "contain", padding: 40, background: "#F1EAFF" }}
              sizes="100vw"
              priority
            />
            {event.organizer && (
              <div className="m-organizer">
                <span className="m-avatar" style={{ overflow: "hidden", display: "block" }}>
                  {event.organizer.avatarUrl ? (
                    <AvatarViewer src={event.organizer.avatarUrl} alt={event.organizer.name}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={event.organizer.avatarUrl} alt="" className="h-full w-full object-cover" />
                    </AvatarViewer>
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-lavender-100 text-sm font-semibold text-ink-600">
                      {event.organizer.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="m-organizer-copy">
                  <span className="m-organizer-name">
                    {event.organizer.name}
                    {event.organizer.age ? `, ${event.organizer.age}` : ""}
                  </span>
                  <span className="m-rating">
                    {event.organizer.ratingAvg > 0 && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src="/mesto/assets/icons/svg/star.svg" alt="" width={16} height={16} />
                    )}
                    <span>
                      {event.organizer.ratingAvg > 0 ? `${event.organizer.ratingAvg.toFixed(1)} · ` : ""}
                      {event.organizer.completedMeetingsCount} встреч
                    </span>
                  </span>
                </span>
              </div>
            )}
          </figure>

          <section className="m-details" aria-label="Информация о встрече">
            <p className="m-info m-date">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mesto/assets/icons/png/calendar.png" alt="" width={26} height={26} />
              <span>{dateLabel}</span>
            </p>
            {addressLine && (
              <p className="m-info m-address">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mesto/assets/icons/png/location.png" alt="" width={26} height={26} />
                <span className="flex-1">{addressLine}</span>
                <button
                  type="button"
                  aria-label="Скопировать адрес"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(addressLine).then(() => {
                      setAddressCopied(true);
                      setTimeout(() => setAddressCopied(false), 1500);
                    });
                  }}
                  className="relative shrink-0 rounded-lg p-1 text-[color:var(--m-muted)] active:bg-black/5"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="8" y="8" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" />
                    <path
                      d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                  </svg>
                  {addressCopied && (
                    <span className="absolute -top-8 right-0 whitespace-nowrap rounded-md bg-[color:var(--m-ink)] px-2 py-1 text-[11px] text-white">
                      Скопировано
                    </span>
                  )}
                </button>
              </p>
            )}
            <div className="m-chips">
              <p className="m-info m-capacity">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mesto/assets/icons/png/people.png" alt="" width={26} height={26} />
                <span>{capacityLabel}</span>
              </p>
              <p className="m-info m-price">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mesto/assets/icons/png/ticket.png" alt="" width={26} height={26} />
                <span>{priceLabel}</span>
              </p>
            </div>
          </section>

          {event.description && <p className="m-description">{event.description}</p>}

          {event.viewerStatus !== "organizer" && (event.status === "published" || event.status === "closed") && (
            <div className="mb-4">
              <BottomAction
                viewerStatus={event.viewerStatus}
                isFull={isFull}
                applying={applying}
                onApply={handleApply}
                eventId={event.id}
              />
            </div>
          )}

          {event.participants.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <div className="flex -space-x-2">
                {event.participants.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-lavender-100 text-xs font-semibold text-ink-600"
                  >
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatarUrl} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      p.name.charAt(0).toUpperCase()
                    )}
                  </div>
                ))}
              </div>
              <span className="text-xs text-ink-600">
                {event.participants.length} {pluralizeParticipants(event.participants.length)}
              </span>
            </div>
          )}

          {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}

          {event.status === "cancelled" && (
            <div className="mb-3 rounded-card bg-red-50 p-4 text-center text-sm text-red-600">
              Эта встреча отменена организатором.
            </div>
          )}

          {canManage && (
            <>
              {event.status === "published" && pendingApplicants.length > 0 && (
                <div className="mb-3 rounded-card bg-white p-4 shadow-card">
                  <h3 className="mb-3 text-sm font-semibold text-ink-900">
                    Новые заявки ({pendingApplicants.length})
                  </h3>
                  <div className="space-y-3">
                    {pendingApplicants.map((app) => (
                      <ApplicantCard
                        key={app.id}
                        application={app}
                        onAccept={(id) => handleApplicantDecision(id, "accept")}
                        onReject={(id) => handleApplicantDecision(id, "reject")}
                        processing={processingApplicantId === app.id}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="m-actions" aria-label="Управление встречей">
                <Link href={`/events/${event.id}/applications`} className="m-action m-requests">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/mesto/assets/icons/png/people.png" alt="" width={52} height={52} />
                  <span className="m-action-label">Заявки</span>
                </Link>
                {event.status === "published" && (
                  <button type="button" className="m-action m-boost" onClick={handleBoost} disabled={boosting} aria-busy={boosting}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/mesto/assets/icons/png/rocket.png" alt="" width={52} height={52} />
                    <span className="m-action-label">
                      {boosting ? "Поднимаем…" : (
                        <>
                          Поднять
                          <br />
                          встречу
                        </>
                      )}
                    </span>
                  </button>
                )}
              </div>
              {boostMessage && <p className="mt-2 text-center text-xs text-ink-600">{boostMessage}</p>}

              {!confirmingCancel ? (
                <button type="button" className="m-action m-cancel" onClick={() => setConfirmingCancel(true)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/mesto/assets/icons/png/cancel.png" alt="" width={44} height={44} />
                  <span className="m-action-label">Отменить встречу</span>
                </button>
              ) : (
                <div className="rounded-card bg-red-50 p-4 text-center shadow-card-lg">
                  <p className="mb-3 text-sm text-ink-900">Точно отменить встречу? Лимит тарифа вернётся.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmingCancel(false)}
                      className="flex-1 rounded-pill bg-white py-2.5 text-sm font-medium text-ink-600 shadow-card"
                    >
                      Не отменять
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="flex-1 rounded-pill bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {cancelling ? "Отменяем..." : "Да, отменить"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function BottomAction({
  viewerStatus,
  isFull,
  applying,
  onApply,
  eventId,
}: {
  viewerStatus: EventDetails["viewerStatus"];
  isFull: boolean;
  applying: boolean;
  onApply: () => void;
  eventId: string;
}) {
  if (viewerStatus === "organizer") {
    return (
      <Link
        href={`/events/${eventId}/applications`}
        className="flex w-full items-center justify-center gap-2 rounded-pill bg-brand-gradient py-4 text-center text-base font-semibold text-white shadow-cta"
      >
        <span className="relative h-7 w-7 shrink-0">
          <Image src="/brand/3d/applications-icon.png" alt="" fill className="object-contain" sizes="28px" />
        </span>
        Управлять заявками
      </Link>
    );
  }
  if (viewerStatus === "accepted") {
    return (
      <div className="w-full rounded-pill bg-ink-900 py-4 text-center text-base font-semibold text-white">
        Ты идёшь ✓
      </div>
    );
  }
  if (viewerStatus === "pending") {
    return (
      <div className="w-full rounded-pill bg-ink-400/10 py-4 text-center text-base font-semibold text-ink-600">
        Отклик отправлен
      </div>
    );
  }
  if (viewerStatus === "rejected") {
    return (
      <div className="w-full rounded-pill bg-ink-400/10 py-4 text-center text-base font-semibold text-ink-400">
        Отклонено
      </div>
    );
  }

  return (
    <button
      onClick={onApply}
      disabled={isFull || applying}
      className="w-full rounded-pill bg-brand-gradient py-4 text-base font-semibold text-white shadow-cta disabled:opacity-40"
    >
      {isFull ? "Мест нет" : applying ? "Отправляем..." : "Я иду"}
    </button>
  );
}

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function pluralizeParticipants(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "человек идёт";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "человека идут";
  return "человек идут";
}
FILE2_EOF
mkdir -p "app/(app)/events/[id]/edit"
cat > "app/(app)/events/[id]/edit/page.tsx" << 'FILE3_EOF'
"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LocationPicker } from "@/components/map/LocationPicker";
import { PhotoCropModal } from "@/components/create-event/PhotoCropModal";
import { searchAddress, type AddressSuggestion } from "@/lib/maps/forward-geocode";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}
interface TrainingType {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

interface EventDetails {
  id: string;
  title: string;
  description: string | null;
  category: { slug: string; name: string; emoji: string | null } | null;
  trainingType: { slug: string; name: string; emoji: string | null } | null;
  placeName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  eventDate: string;
  eventTime: string;
  eventEndTime: string | null;
  seatsTotal: number;
  seatsTaken: number;
  status: string;
  costType: string | null;
  isBusiness: boolean;
  businessPricingType: "ticket" | "free" | "custom" | null;
  businessPricingDetails: string | null;
  photoUrl: string | null;
  viewerStatus: "organizer" | "accepted" | "pending" | "rejected" | "none";
}

const inputClass =
  "block w-full max-w-full min-w-0 box-border rounded-card border border-lavender-200 bg-white px-4 py-3 text-base text-ink-900 outline-none focus:border-accent";

interface EditEventPageProps {
  params: { id: string };
}

export default function EditEventPage({ params }: EditEventPageProps) {
  const { id: eventId } = params;
  const router = useRouter();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [trainingTypeSlug, setTrainingTypeSlug] = useState<string | null>(null);
  const [placeName, setPlaceName] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [seatsTotal, setSeatsTotal] = useState(4);
  const [seatsTaken, setSeatsTaken] = useState(0);
  const [costType, setCostType] = useState<"each_pays" | "organizer_treats" | "free" | "negotiable">("each_pays");
  const [businessPricingType, setBusinessPricingType] = useState<"ticket" | "free" | "custom" | null>(null);
  const [businessTicketPrice, setBusinessTicketPrice] = useState("");
  const [businessCustomTerms, setBusinessCustomTerms] = useState("");
  const [isBusiness, setIsBusiness] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [newPhotoBase64, setNewPhotoBase64] = useState<string | undefined>();
  const [cropSrc, setCropSrc] = useState<string | undefined>();

  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [pickedFromAddress, setPickedFromAddress] = useState<{ latitude: number; longitude: number } | null>(null);
  const suppressAddressSearchRef = useRef(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/events/${eventId}`).then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ])
      .then(([eventData, categoriesData]) => {
        if (eventData.error) {
          setLoadError("Встреча не найдена.");
          return;
        }
        if (eventData.viewerStatus !== "organizer") {
          setLoadError("Редактировать событие может только организатор.");
          return;
        }
        const e: EventDetails = eventData;
        setEvent(e);
        setTitle(e.title);
        setDescription(e.description ?? "");
        setCategorySlug(e.category?.slug ?? null);
        setTrainingTypeSlug(e.trainingType?.slug ?? null);
        setPlaceName(e.placeName ?? "");
        setAddress(e.address ?? "");
        setLatitude(e.latitude ?? undefined);
        setLongitude(e.longitude ?? undefined);
        setEventDate(e.eventDate);
        setEventTime(e.eventTime.slice(0, 5));
        setEventEndTime(e.eventEndTime?.slice(0, 5) ?? "");
        setSeatsTotal(e.seatsTotal);
        setSeatsTaken(e.seatsTaken);
        setIsBusiness(e.isBusiness);
        setPhotoUrl(e.photoUrl);
        if (e.isBusiness) {
          setBusinessPricingType(e.businessPricingType);
          if (e.businessPricingType === "ticket") setBusinessTicketPrice(e.businessPricingDetails ?? "");
          if (e.businessPricingType === "custom") setBusinessCustomTerms(e.businessPricingDetails ?? "");
        } else if (e.costType) {
          setCostType(e.costType as typeof costType);
        }
        setCategories(categoriesData.categories ?? []);
        setTrainingTypes(categoriesData.trainingTypes ?? []);
      })
      .catch(() => setLoadError("Проблема с соединением."))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    if (suppressAddressSearchRef.current) {
      suppressAddressSearchRef.current = false;
      return;
    }
    if (address.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }
    const timeout = setTimeout(() => {
      searchAddress(address).then(setAddressSuggestions);
    }, 400);
    return () => clearTimeout(timeout);
  }, [address]);

  function handlePickAddressSuggestion(s: AddressSuggestion) {
    suppressAddressSearchRef.current = true;
    setAddress(s.address);
    setLatitude(s.latitude);
    setLongitude(s.longitude);
    setPickedFromAddress({ latitude: s.latitude, longitude: s.longitude });
    setAddressSuggestions([]);
  }

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  const canSave =
    title.trim().length >= 3 &&
    placeName.trim().length >= 2 &&
    latitude !== undefined &&
    longitude !== undefined &&
    eventDate.length > 0 &&
    eventTime.length > 0 &&
    eventEndTime.length > 0 &&
    seatsTotal >= seatsTaken &&
    (isBusiness ||
      (categorySlug !== null && (categorySlug !== "training" || trainingTypeSlug !== null)));

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          title,
          description,
          categorySlug: isBusiness ? undefined : categorySlug,
          trainingTypeSlug: trainingTypeSlug ?? undefined,
          placeName,
          address,
          latitude,
          longitude,
          eventDate,
          eventTime,
          eventEndTime,
          seatsTotal,
          costType: isBusiness ? undefined : costType,
          businessPricingType: isBusiness ? businessPricingType ?? undefined : undefined,
          businessPricingDetails: isBusiness
            ? businessPricingType === "ticket"
              ? businessTicketPrice
              : businessPricingType === "custom"
                ? businessCustomTerms
                : undefined
            : undefined,
          photoBase64: newPhotoBase64,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "seats_below_taken") {
          setSaveError(`Нельзя установить меньше ${data.seatsTaken} — столько человек уже подтверждено.`);
        } else if (data.error === "photo_rejected") {
          setSaveError("Это фото не прошло проверку — выбери другое.");
        } else {
          setSaveError("Не получилось сохранить изменения.");
        }
        setSaving(false);
        return;
      }
      setToast("Изменения сохранены");
      setTimeout(() => router.push(`/events/${eventId}`), 700);
    } catch {
      setSaveError("Проблема с соединением.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-ink-600">Загрузка...</p>
      </div>
    );
  }

  if (loadError || !event) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-red-600">{loadError ?? "Что-то пошло не так."}</p>
        <Link href={`/events/${eventId}`} className="text-sm font-medium text-accent">
          Вернуться к событию
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-28">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-lavender-100 bg-background/95 px-5 py-3 backdrop-blur">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm font-medium text-accent">
          <Image src="/brand/icons/back.svg" alt="" width={18} height={18} />
          Назад
        </button>
        <h1 className="text-base font-semibold text-ink-900">Редактировать событие</h1>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="text-sm font-medium text-accent disabled:opacity-40"
        >
          Сохранить
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="relative aspect-[1.4] w-full overflow-hidden rounded-card-lg bg-lavender-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={newPhotoBase64 ?? photoUrl ?? undefined} alt="" className="h-full w-full object-cover" />
          <label className="absolute bottom-3 right-3 flex cursor-pointer items-center gap-1.5 rounded-pill bg-black/60 px-3 py-2 text-sm font-medium text-white">
            📷 Изменить фото
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </label>
        </div>

        <Field label="Название события" counter={`${title.length}/100`}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            className={inputClass}
          />
        </Field>

        {!isBusiness && (
          <Field label="Категория">
            <div className="grid grid-cols-2 gap-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCategorySlug(c.slug);
                    if (c.slug !== "training") setTrainingTypeSlug(null);
                  }}
                  className={`flex items-center gap-2 rounded-card p-3 text-left text-sm font-medium transition ${
                    categorySlug === c.slug ? "bg-brand-gradient text-white shadow-cta" : "bg-white text-ink-900 shadow-card"
                  }`}
                >
                  <span className="text-lg">{c.emoji}</span>
                  {c.name}
                </button>
              ))}
            </div>
            {categorySlug === "training" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {trainingTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTrainingTypeSlug(t.slug)}
                    className={`flex items-center gap-2 rounded-card p-2.5 text-left text-sm font-medium transition ${
                      trainingTypeSlug === t.slug ? "bg-brand-gradient text-white shadow-cta" : "bg-white text-ink-900 shadow-card"
                    }`}
                  >
                    <span>{t.emoji}</span>
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}

        <Field label="Дата и время">
          <div className="flex gap-2">
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className={`${inputClass} h-[52px] appearance-none text-center`}
            />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              className={`${inputClass} h-[52px] min-w-0 flex-1 appearance-none text-center`}
            />
            <span className="text-ink-400">–</span>
            <input
              type="time"
              value={eventEndTime}
              onChange={(e) => setEventEndTime(e.target.value)}
              className={`${inputClass} h-[52px] min-w-0 flex-1 appearance-none text-center`}
            />
          </div>
        </Field>

        <Field label="Место">
          <input
            value={placeName}
            onChange={(e) => setPlaceName(e.target.value)}
            placeholder="Название места"
            className={`mb-2 ${inputClass}`}
          />
          <div className="relative mb-2">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Адрес"
              className={`text-base ${inputClass}`}
            />
            {addressSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-card bg-white shadow-card-lg">
                {addressSuggestions.map((s) => (
                  <button
                    key={s.address}
                    type="button"
                    onMouseDown={() => handlePickAddressSuggestion(s)}
                    className="block w-full border-b border-lavender-100 px-4 py-2.5 text-left text-sm text-ink-900 last:border-0 hover:bg-lavender-50"
                  >
                    {s.address}
                  </button>
                ))}
              </div>
            )}
          </div>
          <LocationPicker
            onPick={({ latitude, longitude }) => {
              setLatitude(latitude);
              setLongitude(longitude);
            }}
            onAddressResolved={(resolved) => {
              suppressAddressSearchRef.current = true;
              setAddress(resolved);
            }}
            externalCoords={pickedFromAddress ?? (latitude && longitude ? { latitude, longitude } : null)}
            heightPx={220}
            markerIconSrc={isBusiness ? "/brand/markers/marker-business.png" : undefined}
          />
        </Field>

        <Field label="Количество участников" counter={`из ${seatsTaken > 0 ? `мин. ${seatsTaken}` : "30"}`}>
          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => setSeatsTotal((n) => Math.max(seatsTaken, n - 1))}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl text-accent shadow-card active:scale-95"
            >
              −
            </button>
            <span className="text-display w-12 text-center">{seatsTotal}</span>
            <button
              type="button"
              onClick={() => setSeatsTotal((n) => Math.min(isBusiness ? 500 : 30, n + 1))}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl text-accent shadow-card active:scale-95"
            >
              +
            </button>
          </div>
          {seatsTaken > 0 && (
            <p className="mt-1 text-center text-xs text-ink-600">Уже подтверждено: {seatsTaken} чел. — меньше этого установить нельзя.</p>
          )}
        </Field>

        <Field label={isBusiness ? "Стоимость" : "Расходы"}>
          {isBusiness ? (
            <>
              <div className="flex flex-col gap-2">
                {(
                  [
                    ["ticket", "По билетам"],
                    ["free", "Бесплатно"],
                    ["custom", "Другие условия"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setBusinessPricingType(value)}
                    className={`rounded-card p-3 text-left text-sm font-medium transition ${
                      businessPricingType === value ? "bg-brand-gradient text-white shadow-cta" : "bg-white text-ink-900 shadow-card"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {businessPricingType === "ticket" && (
                <input
                  value={businessTicketPrice}
                  onChange={(e) => setBusinessTicketPrice(e.target.value)}
                  placeholder="Например: 1500 ₽"
                  maxLength={50}
                  className={`mt-2 ${inputClass}`}
                />
              )}
              {businessPricingType === "custom" && (
                <textarea
                  value={businessCustomTerms}
                  onChange={(e) => setBusinessCustomTerms(e.target.value)}
                  maxLength={300}
                  rows={3}
                  className={`mt-2 resize-none text-base ${inputClass}`}
                />
              )}
            </>
          ) : (
            <div className="flex flex-col gap-2">
              {(
                [
                  ["each_pays", "Каждый за себя"],
                  ["organizer_treats", "Автор угощает"],
                  ["free", "Без расходов"],
                  ["negotiable", "По договорённости"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCostType(value)}
                  className={`rounded-card p-3 text-left text-sm font-medium transition ${
                    costType === value ? "bg-brand-gradient text-white shadow-cta" : "bg-white text-ink-900 shadow-card"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Описание" counter={`${description.length}/500`}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={4}
            className={`resize-none text-base ${inputClass}`}
          />
        </Field>

        {saveError && <p className="text-center text-sm text-red-600">{saveError}</p>}

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full rounded-pill bg-brand-gradient py-4 text-base font-semibold text-white shadow-cta disabled:opacity-40"
        >
          {saving ? "Сохраняем..." : "Сохранить изменения"}
        </button>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-28 z-40 flex justify-center px-5">
          <span className="rounded-pill bg-ink-900 px-4 py-2.5 text-sm font-medium text-white shadow-card-lg">{toast}</span>
        </div>
      )}

      {cropSrc && (
        <PhotoCropModal
          src={cropSrc}
          aspectRatio={1.4}
          onCancel={() => setCropSrc(undefined)}
          onConfirm={(dataUrl) => {
            setNewPhotoBase64(dataUrl);
            setCropSrc(undefined);
          }}
        />
      )}
    </div>
  );
}

function Field({ label, counter, children }: { label: string; counter?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card-lg bg-white p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-ink-600">{label}</span>
        {counter && <span className="text-xs text-ink-400">{counter}</span>}
      </div>
      {children}
    </div>
  );
}
FILE3_EOF
