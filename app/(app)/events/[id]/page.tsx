"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ApplicantCard, type ApplicantCardData } from "@/components/applications/ApplicantCard";
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
    <div className="pb-28">
      <div className="mesto" style={{ "--m-nav-height": "0px" } as CSSProperties}>
        <main className="m-page" style={{ paddingBottom: 24 }}>
          <div className="mb-3 flex items-center gap-3">
            <button onClick={() => router.back()} aria-label="Назад">
              <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
            </button>
          </div>

          <div className="m-badge">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mesto/assets/icons/png/business.png" alt="" />
            <span>{categoryLabel}</span>
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
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={event.organizer.avatarUrl} alt="" className="h-full w-full object-cover" />
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
                      <img src="/mesto/assets/icons/svg/star.svg" alt="" />
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
              <img src="/mesto/assets/icons/png/calendar.png" alt="" />
              <span>{dateLabel}</span>
            </p>
            {addressLine && (
              <p className="m-info m-address">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mesto/assets/icons/png/location.png" alt="" />
                <span>{addressLine}</span>
              </p>
            )}
            <div className="m-chips">
              <p className="m-info m-capacity">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mesto/assets/icons/png/people.png" alt="" />
                <span>{capacityLabel}</span>
              </p>
              <p className="m-info m-price">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mesto/assets/icons/png/ticket.png" alt="" />
                <span>{priceLabel}</span>
              </p>
            </div>
          </section>

          {event.description && <p className="m-description">{event.description}</p>}

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
                  <img src="/mesto/assets/icons/png/people.png" alt="" />
                  <span className="m-action-label">Заявки</span>
                </Link>
                {event.status === "published" && (
                  <button type="button" className="m-action m-boost" onClick={handleBoost} disabled={boosting} aria-busy={boosting}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/mesto/assets/icons/png/rocket.png" alt="" />
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
                  <img src="/mesto/assets/icons/png/cancel.png" alt="" />
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

      {/* Фиксированная кнопка внизу — только для тех, кто НЕ организатор
          (у организатора теперь блок m-actions/m-cancel в самом контенте
          выше, по дизайн-киту "Акцент на фото"). */}
      {event.viewerStatus !== "organizer" && (event.status === "published" || event.status === "closed") && (
        <div className="fixed inset-x-0 bottom-24 z-40 px-5">
          <BottomAction
            viewerStatus={event.viewerStatus}
            isFull={isFull}
            applying={applying}
            onApply={handleApply}
            eventId={event.id}
          />
        </div>
      )}
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
