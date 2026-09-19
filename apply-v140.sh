mkdir -p "app/(app)/events/[id]"
cat > "app/(app)/events/[id]/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ApplicantCard, type ApplicantCardData } from "@/components/applications/ApplicantCard";

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

  return (
    <div className="pb-28">
      <div className="flex items-center gap-3 px-5 pt-4">
        <button onClick={() => router.back()} aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </button>
      </div>

      <div className="px-5 pt-4">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-accent">
          {categoryIcon ? (
            <div className="relative h-5 w-5 shrink-0">
              <Image src={categoryIcon} alt="" fill className="object-contain" sizes="20px" />
            </div>
          ) : (
            <span>{event.category?.emoji}</span>
          )}
          <span>{categoryLabel}</span>
        </div>

        <h1 className="text-display mb-3">{event.title}</h1>

        <div className="mb-4 space-y-1.5 text-sm text-ink-600">
          <p>
            {formatDate(event.eventDate)} ·{" "}
            {event.eventEndTime
              ? `${event.eventTime.slice(0, 5)}–${event.eventEndTime.slice(0, 5)}`
              : event.eventTime.slice(0, 5)}
          </p>
          {event.placeName && (
            <p>
              {event.placeName}
              {event.address ? `, ${event.address}` : ""}
            </p>
          )}
          <p>{isFull ? "Мест нет" : `Свободно мест: ${seatsLeft} из ${event.seatsTotal}`}</p>
          {event.isBusiness && (
            <p>
              {event.businessPricingType === "ticket"
                ? `Билет: ${event.businessPricingDetails}`
                : event.businessPricingType === "custom"
                  ? event.businessPricingDetails
                  : "Бесплатно"}
            </p>
          )}
        </div>

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

        {event.description && <p className="mb-5 text-sm text-ink-900">{event.description}</p>}

        {event.organizer && (
          <div className="mb-5 flex items-center gap-3 rounded-card bg-white p-4 shadow-card">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-background text-sm font-semibold text-ink-600">
              {event.organizer.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={event.organizer.avatarUrl} alt={event.organizer.name} className="h-full w-full object-cover" />
              ) : (
                event.organizer.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-900">
                {event.organizer.name}, {event.organizer.age}
              </p>
              <p className="text-xs text-ink-600">
                {event.organizer.ratingAvg > 0 ? `⭐ ${event.organizer.ratingAvg.toFixed(1)} · ` : ""}
                {event.organizer.completedMeetingsCount} встреч проведено
              </p>
            </div>
          </div>
        )}

        {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}

        {event.status === "cancelled" && (
          <div className="mb-3 rounded-card bg-red-50 p-4 text-center text-sm text-red-600">
            Эта встреча отменена организатором.
          </div>
        )}

        {event.viewerStatus === "organizer" &&
          (event.status === "published" || event.status === "closed") && (
          <div className="mb-3 space-y-3">
            {event.status === "published" && pendingApplicants.length > 0 && (
              <div className="rounded-card bg-white p-4 shadow-card">
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

            {/* "Поднять встречу" имеет смысл только пока идёт набор — для
                забитой (closed) встречи мест всё равно нет. */}
            {event.status === "published" && (
              <>
                <button
                  onClick={handleBoost}
                  disabled={boosting}
                  className="flex w-full items-center justify-center gap-2 rounded-pill bg-brand-gradient py-3 text-sm font-semibold text-white shadow-cta disabled:opacity-60"
                >
                  <span className="text-lg">🚀</span>
                  {boosting ? "Поднимаем..." : "Поднять встречу"}
                </button>
                {boostMessage && <p className="text-center text-xs text-ink-600">{boostMessage}</p>}
              </>
            )}

            {/* Отменить встречу — доступно и для забитой (closed) встречи,
                не только для той, что ещё набирает участников. */}
            {!confirmingCancel ? (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="w-full text-center text-sm font-medium text-red-600"
              >
                Отменить встречу
              </button>
            ) : (
              <div className="rounded-card bg-red-50 p-4 text-center">
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
          </div>
        )}
      </div>

      {/* Кнопка "Управлять заявками" (единственный путь к удалению
          участника организатором) — тоже нужна и для забитой (closed)
          встречи, не только для набирающей участников. */}
      {(event.status === "published" || event.status === "closed") && (
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
        className="block w-full rounded-pill bg-brand-gradient py-4 text-center text-base font-semibold text-white shadow-cta"
      >
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
ENDOFFILE

mkdir -p "app/(app)/my-events"
cat > "app/(app)/my-events/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface MyEvent {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  placeName: string | null;
  status: string;
  category: { slug: string; name: string; emoji: string | null } | null;
  isBusiness: boolean;
  role: "organizer" | "participant";
  pendingApplicationsCount: number;
  pendingApplicantPreview: { id: string; name: string; avatarUrl: string | null } | null;
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

const STATUS_LABEL: Record<string, string> = {
  published: "Активна",
  closed: "Встреча забита",
  completed: "Завершена",
  cancelled: "Отменена",
};

export default function MyEventsPage() {
  const [items, setItems] = useState<MyEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me/events")
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-5 py-4">
      <h1 className="text-display mb-4">Мои встречи</h1>

      <div className="mb-4 flex gap-2">
        <Link
          href="/search"
          className="flex-1 rounded-pill bg-white px-4 py-2 text-center text-sm font-medium text-ink-900 shadow-card"
        >
          Все встречи
        </Link>
        <span className="flex-1 rounded-pill bg-accent px-4 py-2 text-center text-sm font-medium text-white shadow-card">
          Мои встречи
        </span>
      </div>

      {loading && <p className="text-center text-sm text-ink-600">Загрузка...</p>}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <div className="relative mb-4 h-28 w-28">
            <Image src="/brand/3d/empty-quiet.png" alt="" fill className="object-contain" sizes="112px" />
          </div>
          <p className="text-sm text-ink-600">Ты пока нигде не участвуешь и ничего не создавал.</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((event) => {
          const icon = event.isBusiness ? "/brand/markers/marker-business.png" : event.category ? CATEGORY_ICON[event.category.slug] : undefined;
          return (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card"
            >
              {icon ? (
                <div className="relative h-10 w-10 shrink-0">
                  <Image src={icon} alt="" fill className="object-contain" sizes="40px" />
                  {event.pendingApplicationsCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-red-500 px-1 text-[10px] font-semibold text-white">
                      {event.pendingApplicationsCount}
                    </span>
                  )}
                  <ApplicantPreviewBadge preview={event.pendingApplicantPreview} />
                </div>
              ) : (
                <div className="relative shrink-0">
                  <span className="text-2xl">{event.category?.emoji}</span>
                  {event.pendingApplicationsCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-red-500 px-1 text-[10px] font-semibold text-white">
                      {event.pendingApplicationsCount}
                    </span>
                  )}
                  <ApplicantPreviewBadge preview={event.pendingApplicantPreview} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{event.title}</p>
                <p className="truncate text-xs text-ink-600">
                  {formatDate(event.eventDate)} · {event.eventTime.slice(0, 5)}
                  {event.placeName ? ` · ${event.placeName}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="block text-[11px] font-medium text-accent">
                  {event.role === "organizer" ? "Организатор" : "Участник"}
                </span>
                <span className="block text-[11px] text-ink-400">{STATUS_LABEL[event.status] ?? event.status}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

/**
 * Аватарка самого свежего заявителя (или плюсик, если фото нет) — снизу
 * от иконки категории на карточке встречи, чтобы сразу видеть, КТО
 * откликнулся, не только сколько (число уже показано сверху).
 */
function ApplicantPreviewBadge({
  preview,
}: {
  preview: { id: string; name: string; avatarUrl: string | null } | null;
}) {
  if (!preview) return null;

  return (
    <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-lavender-100 text-[9px] font-semibold text-ink-600">
      {preview.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.avatarUrl} alt={preview.name} className="h-full w-full object-cover" />
      ) : (
        <span>+</span>
      )}
    </div>
  );
}
ENDOFFILE

mkdir -p "app/api/me/events"
cat > "app/api/me/events/route.ts" << 'ENDOFFILE'
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/me/events
 * Все встречи, где текущий пользователь организатор или участник —
 * для экрана "Мои встречи" в профиле.
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: memberRows } = await admin
    .from("event_members")
    .select("event_id, role")
    .eq("user_id", currentUser.userId);

  const eventIds = (memberRows ?? []).map((m) => m.event_id);
  if (eventIds.length === 0) return NextResponse.json({ items: [] });

  const roleByEventId = new Map((memberRows ?? []).map((m) => [m.event_id, m.role]));

  const { data: events, error } = await admin
    .from("events")
    .select(
      `
      id, title, event_date, event_time, place_name, status, is_business,
      category:categories(slug, name, emoji)
      `
    )
    .in("id", eventIds)
    // "Мои встречи" — активные для САМОГО пользователя: показываем и
    // published, и closed (заполненные — организатор/участники всё ещё
    // должны их видеть и пользоваться чатом). Пропадают отсюда только
    // completed (по-настоящему прошедшие) и cancelled.
    .in("status", ["published", "closed"])
    .order("event_date", { ascending: false });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  // Сколько новых (ещё не рассмотренных) заявок ждёт организатора на
  // каждую его встречу — чтобы показать значок прямо на карточке встречи,
  // не только общим уведомлением. Плюс аватарка ОДНОГО (самого свежего)
  // заявителя — чтобы сразу было видно, КТО откликнулся, не только сколько.
  const organizerEventIds = eventIds.filter((id) => roleByEventId.get(id) === "organizer");
  const pendingCountByEventId = new Map<string, number>();
  const pendingPreviewByEventId = new Map<string, { id: string; name: string; avatarUrl: string | null }>();
  if (organizerEventIds.length > 0) {
    const { data: pendingApplications } = await admin
      .from("applications")
      .select("event_id, created_at, applicant:users(id, name, avatar_url)")
      .in("event_id", organizerEventIds)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    for (const a of pendingApplications ?? []) {
      pendingCountByEventId.set(a.event_id, (pendingCountByEventId.get(a.event_id) ?? 0) + 1);
      if (!pendingPreviewByEventId.has(a.event_id)) {
        const applicant = a.applicant as unknown as { id: string; name: string; avatar_url: string | null } | null;
        if (applicant) {
          pendingPreviewByEventId.set(a.event_id, {
            id: applicant.id,
            name: applicant.name,
            avatarUrl: applicant.avatar_url,
          });
        }
      }
    }
  }

  const items = (events ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    eventDate: e.event_date,
    eventTime: e.event_time,
    placeName: e.place_name,
    status: e.status,
    category: e.category,
    isBusiness: e.is_business,
    role: roleByEventId.get(e.id) === "organizer" ? "organizer" : "participant",
    pendingApplicationsCount: pendingCountByEventId.get(e.id) ?? 0,
    pendingApplicantPreview: pendingPreviewByEventId.get(e.id) ?? null,
  }));

  return NextResponse.json({ items });
}
ENDOFFILE

mkdir -p "components/chat"
cat > "components/chat/ChatListItem.tsx" << 'ENDOFFILE'
"use client";

import Link from "next/link";
import Image from "next/image";
import { ReadTicks } from "./ReadTicks";
import { CATEGORY_ICON } from "@/lib/data/category-icons";

export interface ChatListItemData {
  conversationId: string;
  unreadCount: number;
  isBlocked: boolean;
  isFavorite: boolean;
  eventTitle: string | null;
  eventStatus: string | null;
  category: { slug: string; name: string; emoji: string | null } | null;
  isBusiness: boolean;
  otherUser: { id: string; name: string; avatarUrl: string | null } | null;
  /** Сколько всего человек в чате, кроме меня — 1 = обычный диалог, больше 1 = групповой чат встречи. */
  otherMembersCount: number;
  lastMessage: { content: string; createdAt: string; isMine: boolean } | null;
  /** Прочитали ли ВСЕ остальные участники наше последнее сообщение (только когда lastMessage.isMine). */
  isLastMessageRead?: boolean;
}

export function ChatListItem({
  chat,
  onToggleFavorite,
}: {
  chat: ChatListItemData;
  onToggleFavorite: (conversationId: string, next: boolean) => void;
}) {
  const categoryIcon = chat.isBusiness ? "/brand/markers/marker-business.png" : chat.category ? CATEGORY_ICON[chat.category.slug] : undefined;
  const isEventClosed = chat.eventStatus === "completed" || chat.eventStatus === "cancelled";
  const name = chat.otherUser?.name ?? "Пользователь";
  // Заголовок карточки — название встречи (по референсу это важнее, чем
  // "с кем", ты сначала вспоминаешь ПРО ЧТО был чат) — теперь так вообще
  // всегда, раз чат один на всю встречу, а не на человека.
  const title = chat.eventTitle ?? name;
  const isUnread = chat.unreadCount > 0;

  const previewText = chat.lastMessage
    ? `${chat.lastMessage.isMine ? "Вы" : name.split(" ")[0]}: ${chat.lastMessage.content}`
    : "Чат создан";

  const chatBody = (
    <>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-base font-semibold text-ink-600">
        {chat.category ? (
          categoryIcon ? (
            <Image src={categoryIcon} alt="" width={28} height={28} className="object-contain" />
          ) : (
            <span className="text-xl">{chat.category.emoji ?? "💬"}</span>
          )
        ) : chat.otherUser?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chat.otherUser.avatarUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate ${isUnread ? "font-semibold text-ink-900" : "font-medium text-ink-900"}`}>
            {title}
          </span>
          {isEventClosed ? (
            <span className="shrink-0 text-xs text-ink-400">Событие закрыто</span>
          ) : (
            chat.lastMessage && (
              <span
                className={`flex shrink-0 items-center gap-1 text-xs ${isUnread ? "font-medium text-accent" : "text-ink-400"}`}
              >
                {chat.lastMessage.isMine && <ReadTicks status={chat.isLastMessageRead ? "read" : "sent"} />}
                {formatListTime(chat.lastMessage.createdAt)}
              </span>
            )
          )}
        </div>
        <p className={`truncate text-sm ${isUnread ? "font-medium text-ink-900" : "text-ink-600"}`}>{previewText}</p>
      </div>

      {isUnread && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-accent px-1.5 text-xs font-semibold text-white">
          {chat.unreadCount}
        </span>
      )}
    </>
  );

  return (
    <div className={`flex items-center gap-2 rounded-card bg-white p-3 shadow-card ${isEventClosed ? "opacity-60" : ""}`}>
      {isEventClosed ? (
        // Закрытая встреча — в чат вообще нельзя зайти (не просто нельзя
        // писать), поэтому здесь обычный div, а не ссылка.
        <div className="flex min-w-0 flex-1 cursor-default items-center gap-3">{chatBody}</div>
      ) : (
        <Link href={`/chats/${chat.conversationId}`} className="flex min-w-0 flex-1 items-center gap-3">
          {chatBody}
        </Link>
      )}

      <button
        onClick={() => onToggleFavorite(chat.conversationId, !chat.isFavorite)}
        aria-label={chat.isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
        className="shrink-0 p-1"
      >
        <StarIcon filled={chat.isFavorite} />
      </button>
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? "#FFB800" : "none"}>
      <path
        d="M12 2.5l2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7-5.4-4.7 7.1-.7L12 2.5z"
        stroke={filled ? "#FFB800" : "#B8B8C8"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function formatListTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (isSameDay(date, now)) {
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Вчера";

  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays < 7) return WEEKDAYS[date.getDay()] ?? "";

  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
ENDOFFILE

mkdir -p "app/api/conversations"
cat > "app/api/conversations/route.ts" << 'ENDOFFILE'
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/conversations
 * Список чатов текущего пользователя (кроме скрытых), с превью последнего
 * сообщения, unread count и данными собеседника (п.15 ТЗ).
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: memberships, error } = await admin
    .from("conversation_members")
    .select(
      `
      conversation_id, unread_count, is_hidden, is_blocked, is_favorite,
      conversations(id, event_id, events(title, status, is_business, category:categories(slug, name, emoji)))
      `
    )
    .eq("user_id", currentUser.userId)
    .eq("is_hidden", false)
    .order("conversation_id", { ascending: false });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const conversationIds = (memberships ?? []).map((m) => m.conversation_id);
  if (conversationIds.length === 0) return NextResponse.json({ items: [] });

  const [{ data: otherMembers }, { data: lastMessages }] = await Promise.all([
    admin
      .from("conversation_members")
      .select("conversation_id, last_read_at, users(id, name, avatar_url)")
      .in("conversation_id", conversationIds)
      .neq("user_id", currentUser.userId),
    admin
      .from("messages")
      .select("conversation_id, content, created_at, sender_id")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false }),
  ]);

  const otherMembersByConversation = new Map<
    string,
    { id: string; name: string; avatarUrl: string | null; lastReadAt: string | null }[]
  >();
  for (const m of otherMembers ?? []) {
    const user = m.users as unknown as { id: string; name: string; avatar_url: string | null } | null;
    if (!user) continue;
    const list = otherMembersByConversation.get(m.conversation_id) ?? [];
    list.push({ id: user.id, name: user.name, avatarUrl: user.avatar_url, lastReadAt: m.last_read_at as string | null });
    otherMembersByConversation.set(m.conversation_id, list);
  }

  const lastMessageByConversation = new Map<
    string,
    { content: string; createdAt: string; isMine: boolean }
  >();
  for (const msg of lastMessages ?? []) {
    if (!lastMessageByConversation.has(msg.conversation_id)) {
      lastMessageByConversation.set(msg.conversation_id, {
        content: msg.content,
        createdAt: msg.created_at,
        isMine: msg.sender_id === currentUser.userId,
      });
    }
  }

  const items = (memberships ?? []).map((m) => {
    const conversation = m.conversations as unknown as {
      id: string;
      event_id: string | null;
      events: {
        title: string;
        status: string;
        is_business: boolean;
        category: { slug: string; name: string; emoji: string | null } | null;
      } | null;
    } | null;
    const otherMembersList = otherMembersByConversation.get(m.conversation_id) ?? [];
    const lastMessage = lastMessageByConversation.get(m.conversation_id) ?? null;
    // "Прочитано" (двойная зелёная галочка в списке чатов, как в MessageBubble
    // внутри самого чата) имеет смысл только для СВОИХ последних сообщений —
    // для входящих у нас и так есть индикатор непрочитанного (unreadCount).
    // В групповом чате считаем прочитанным только когда ВСЕ остальные
    // участники увидели сообщение.
    const isLastMessageRead =
      !!lastMessage?.isMine &&
      otherMembersList.length > 0 &&
      otherMembersList.every((om) => om.lastReadAt && lastMessage.createdAt <= om.lastReadAt);

    return {
      conversationId: m.conversation_id,
      unreadCount: m.unread_count,
      isBlocked: m.is_blocked,
      isFavorite: m.is_favorite,
      eventTitle: conversation?.events?.title ?? null,
      eventStatus: conversation?.events?.status ?? null,
      category: conversation?.events?.category ?? null,
      isBusiness: conversation?.events?.is_business ?? false,
      // otherUser — для отображения аватара в списке: если участник один
      // (как раньше), показываем его фото; если несколько — компонент сам
      // решает показать иконку группы (см. otherMembersCount).
      otherUser: otherMembersList[0] ?? null,
      otherMembersCount: otherMembersList.length,
      lastMessage,
      isLastMessageRead,
    };
  });

  // Свежие сообщения — выше в списке
  items.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt ?? "";
    const bTime = b.lastMessage?.createdAt ?? "";
    return bTime.localeCompare(aTime);
  });

  return NextResponse.json({ items });
}
ENDOFFILE

mkdir -p "app/api/conversations/[id]/messages"
cat > "app/api/conversations/[id]/messages/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";
import { buildNotificationText } from "@/lib/notifications/text";

const MESSAGE_HISTORY_LIMIT = 50;

async function assertMembership(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  userId: string
) {
  const { data } = await admin
    .from("conversation_members")
    .select("id, is_blocked")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/**
 * GET /api/conversations/[id]/messages
 * История сообщений (последние 50, по возрастанию времени) + название
 * встречи и список ОСТАЛЬНЫХ участников (для шапки группового чата и
 * подписи над входящими сообщениями — теперь участников может быть
 * несколько, не только один собеседник, как раньше).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const membership = await assertMembership(admin, conversationId, currentUser.userId);
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Если событие уже прошло или отменено — в чат вообще нельзя зайти
  // (не только нельзя писать), см. явное требование пользователя.
  const { data: eventCheckRow } = await admin
    .from("conversations")
    .select("events(status)")
    .eq("id", conversationId)
    .maybeSingle();
  const eventCheckStatus = (eventCheckRow?.events as unknown as { status: string } | null)?.status;
  if (eventCheckStatus === "completed" || eventCheckStatus === "cancelled") {
    return NextResponse.json({ error: "event_closed" }, { status: 403 });
  }

  const [{ data: messages, error }, { data: otherMemberRows }, { data: conversationRow }] = await Promise.all([
    admin
      .from("messages")
      .select("id, sender_id, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_HISTORY_LIMIT),
    // Все ОСТАЛЬНЫЕ участники (не только один, как раньше) — имя и фото
    // для подписи над сообщениями, last_read_at каждого для галочек
    // "прочитано" (сообщение считается прочитанным только когда ВСЕ
    // остальные участники его увидели — логично для группового чата).
    admin
      .from("conversation_members")
      .select("last_read_at, user:users(id, name, avatar_url)")
      .eq("conversation_id", conversationId)
      .neq("user_id", currentUser.userId),
    admin
      .from("conversations")
      .select("event_id, events(title, status, is_business, category:categories(slug, name, emoji))")
      .eq("id", conversationId)
      .maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const members = (otherMemberRows ?? [])
    .map((row) => {
      const user = row.user as unknown as { id: string; name: string; avatar_url: string | null } | null;
      if (!user) return null;
      return { id: user.id, name: user.name, avatarUrl: user.avatar_url, lastReadAt: row.last_read_at as string | null };
    })
    .filter((m): m is { id: string; name: string; avatarUrl: string | null; lastReadAt: string | null } => !!m);

  const eventInfo = conversationRow?.events as unknown as {
    title: string;
    status: string;
    is_business: boolean;
    category: { slug: string; name: string; emoji: string | null } | null;
  } | null;

  return NextResponse.json({
    // ВАЖНО: преобразуем snake_case из базы (sender_id, created_at) в
    // camelCase (senderId, createdAt), который ждёт фронтенд — раньше эта
    // строка отдавала сырые строки БД напрямую, из-за чего даты не
    // парсились ("Invalid Date") и определение "моё/чужое" сообщение
    // всегда давало false (senderId был undefined) — все сообщения
    // выглядели одинаково.
    messages: (messages ?? [])
      .reverse()
      .map((m) => ({ id: m.id, senderId: m.sender_id, content: m.content, createdAt: m.created_at })),
    eventTitle: eventInfo?.title ?? null,
    eventStatus: eventInfo?.status ?? null,
    category: eventInfo?.category ?? null,
    isBusiness: eventInfo?.is_business ?? false,
    members,
  });
}

/**
 * POST /api/conversations/[id]/messages
 * Body: { content: string }
 * Отправка сообщения. Realtime сам разошлёт INSERT всем подписанным
 * участникам (включая отправителя) — фронтенду не нужно оптимистично
 * добавлять сообщение в UI, оно придёт через подписку.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ error: "empty_message" }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: "message_too_long" }, { status: 422 });

  const admin = createAdminClient();

  const membership = await assertMembership(admin, conversationId, currentUser.userId);
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (membership.is_blocked) return NextResponse.json({ error: "blocked" }, { status: 403 });

  // Если событие уже прошло или отменено — чат закрывается на отправку
  // новых сообщений (переписку по-прежнему можно читать и открывать).
  const { data: conversationRow } = await admin
    .from("conversations")
    .select("events(status)")
    .eq("id", conversationId)
    .maybeSingle();
  const eventStatus = (conversationRow?.events as unknown as { status: string } | null)?.status;
  if (eventStatus === "completed" || eventStatus === "cancelled") {
    return NextResponse.json({ error: "event_closed" }, { status: 422 });
  }

  const { data: message, error } = await admin
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: currentUser.userId, content })
    .select("id, created_at")
    .single();

  if (error || !message) return NextResponse.json({ error: "send_failed" }, { status: 500 });

  await admin.rpc("increment_conversation_unread", {
    p_conversation_id: conversationId,
    p_exclude_user_id: currentUser.userId,
  });

  // Уведомляем остальных участников диалога о новом сообщении (кроме
  // отправителя) — иначе у людей нет способа узнать о непрочитанном,
  // кроме как самим зайти в чат.
  const { data: otherMembers } = await admin
    .from("conversation_members")
    .select("user_id, users(telegram_id)")
    .eq("conversation_id", conversationId)
    .neq("user_id", currentUser.userId);

  if (otherMembers && otherMembers.length > 0) {
    await admin.from("notifications").insert(
      otherMembers.map((m) => ({
        user_id: m.user_id,
        type: "new_message",
        payload: { conversationId },
      }))
    );

    // Тот же текст, что и на экране "Уведомления" в приложении — без
    // содержимого самого сообщения (не пересылаем переписку в Telegram).
    const notificationText = buildNotificationText("new_message", undefined);
    await Promise.all(
      otherMembers.map((m) => {
        const telegramId = (m.users as unknown as { telegram_id: number } | null)?.telegram_id;
        if (!telegramId) return Promise.resolve();
        return notifyTelegram(telegramId, notificationText);
      })
    );
  }

  return NextResponse.json({ status: "sent", messageId: message.id, createdAt: message.created_at });
}
ENDOFFILE

mkdir -p "app/chats/[id]"
cat > "app/chats/[id]/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { MessageBubble, formatDayLabel, type MessageData } from "@/components/chat/MessageBubble";
import { MiniProfileSheet } from "@/components/chat/MiniProfileSheet";
import { CATEGORY_ICON } from "@/lib/data/category-icons";
import { createBrowserRealtimeClient } from "@/lib/supabase/browser-realtime";
import { useTelegramViewportHeight } from "@/lib/telegram/webapp-client";
import { useVisualViewportHeight } from "@/lib/hooks/use-visual-viewport-height";
import { useLockBodyScroll } from "@/lib/hooks/use-lock-body-scroll";

interface ChatPageProps {
  // Next.js 14 (в этом проекте) передаёт params клиентским компонентам
  // как обычный объект, НЕ как Promise — это фича Next.js 15. Использование
  // React.use(params) здесь было реальным багом: он падает с
  // "client-side exception" при самом первом открытии страницы, потому что
  // use() поддерживает только Promise/Context, а не произвольный объект.
  params: { id: string };
}

interface Member {
  id: string;
  name: string;
  avatarUrl: string | null;
  lastReadAt: string | null;
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id: conversationId } = params;
  const router = useRouter();
  useLockBodyScroll();

  const visualViewportHeight = useVisualViewportHeight();
  const telegramViewportHeight = useTelegramViewportHeight();
  const liveHeight = visualViewportHeight ?? telegramViewportHeight;

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [eventStatus, setEventStatus] = useState<string | null>(null);
  const [category, setCategory] = useState<{ slug: string; name: string; emoji: string | null } | null>(null);
  const [isBusiness, setIsBusiness] = useState(false);
  // Все ОСТАЛЬНЫЕ участники чата (не считая себя) — на встречу с 3-4
  // принятыми людьми это будет несколько человек, не один собеседник.
  const [members, setMembers] = useState<Member[]>([]);
  const [showMiniProfileFor, setShowMiniProfileFor] = useState<string | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessBlocked, setAccessBlocked] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<SupabaseClient | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      try {
        const [meRes, tokenRes, historyRes] = await Promise.all([
          fetch("/api/me"),
          fetch("/api/auth/realtime-token"),
          fetch(`/api/conversations/${conversationId}/messages`),
        ]);

        if (!meRes.ok || !tokenRes.ok || !historyRes.ok) {
          if (historyRes.status === 403) {
            const data = await historyRes.json().catch(() => ({}));
            if (data.error === "event_closed" && !cancelled) {
              setAccessBlocked(true);
              return;
            }
          }
          if (!cancelled) setError("Не удалось открыть чат.");
          return;
        }

        const [me, tokenData, history] = await Promise.all([
          meRes.json(),
          tokenRes.json(),
          historyRes.json(),
        ]);

        if (cancelled) return;

        setMyUserId(me.userId);
        setMessages(history.messages ?? []);
        setEventTitle(history.eventTitle ?? null);
        setEventStatus(history.eventStatus ?? null);
        setCategory(history.category ?? null);
        setIsBusiness(history.isBusiness ?? false);
        setMembers(history.members ?? []);

        const client = createBrowserRealtimeClient(tokenData.token);
        clientRef.current = client;

        const channel = client
          .channel(`conversation:${conversationId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `conversation_id=eq.${conversationId}`,
            },
            (payload) => {
              const row = payload.new as {
                id: string;
                sender_id: string;
                content: string;
                created_at: string;
              };
              setMessages((prev) =>
                prev.some((m) => m.id === row.id)
                  ? prev
                  : [...prev, { id: row.id, senderId: row.sender_id, content: row.content, createdAt: row.created_at }]
              );
            }
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "conversation_members",
              filter: `conversation_id=eq.${conversationId}`,
            },
            (payload) => {
              const row = payload.new as { user_id: string; last_read_at: string | null };
              if (row.user_id === me.userId) return;
              setMembers((prev) =>
                prev.map((m) => (m.id === row.user_id ? { ...m, lastReadAt: row.last_read_at } : m))
              );
            }
          )
          .subscribe();

        channelRef.current = channel;

        fetch(`/api/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_read" }),
        }).catch(() => {});
      } catch {
        if (!cancelled) setError("Проблема с соединением.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (channelRef.current) clientRef.current?.removeChannel(channelRef.current);
    };
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, liveHeight]);

  async function handleSend() {
    const content = draft.trim();
    if (!content || sending || !myUserId || isEventClosed) return;

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, senderId: myUserId, content, createdAt: new Date().toISOString() }]);
    setSending(true);
    setDraft("");
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError("Не получилось отправить сообщение.");
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setDraft(content);
        return;
      }
      if (data.messageId && data.createdAt) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, id: data.messageId, createdAt: data.createdAt } : m))
        );
      }
    } catch {
      setError("Проблема с соединением.");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(content);
    } finally {
      setSending(false);
    }
  }

  const isGroup = members.length > 1;
  const isEventClosed = eventStatus === "completed" || eventStatus === "cancelled";
  const headerTitle = eventTitle ?? (members.length === 1 ? (members[0]?.name ?? "Чат") : "Чат");
  const soleMember = members.length === 1 ? members[0] : null;
  const categoryIcon = isBusiness ? "/brand/markers/marker-business.png" : category ? CATEGORY_ICON[category.slug] : undefined;

  if (accessBlocked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-lg font-medium text-ink-900">Чат недоступен</p>
        <p className="text-sm text-ink-600">Событие уже прошло или было отменено.</p>
        <button
          onClick={() => router.push("/chats")}
          className="mt-2 rounded-pill bg-brand-gradient px-6 py-3 text-sm font-semibold text-white shadow-cta"
        >
          Назад к чатам
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 flex flex-col overflow-hidden"
      style={{ height: liveHeight ? `${liveHeight}px` : "100dvh" }}
    >
      <div className={`flex shrink-0 items-center gap-3 border-b border-lavender-100 bg-white px-4 py-3 ${isEventClosed ? "opacity-60" : ""}`}>
        <button onClick={() => router.push("/chats")} aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </button>
        <button
          onClick={() => (soleMember ? setShowMiniProfileFor(soleMember.id) : setShowParticipants(true))}
          className="flex min-w-0 flex-1 items-center gap-3"
          disabled={members.length === 0}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-xs font-semibold text-ink-600">
            {categoryIcon ? (
              <Image src={categoryIcon} alt="" width={20} height={20} className="object-contain" />
            ) : category?.emoji ? (
              <span className="text-sm">{category.emoji}</span>
            ) : soleMember ? (
              soleMember.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={soleMember.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                soleMember.name.charAt(0).toUpperCase()
              )
            ) : (
              <span className="text-sm">👥</span>
            )}
          </div>
          <span className="truncate font-medium">{headerTitle}</span>
          {isEventClosed ? (
            <span className="shrink-0 text-xs text-ink-400">Событие закрыто</span>
          ) : (
            isGroup && <span className="shrink-0 text-xs text-ink-400">{members.length + 1} чел.</span>
          )}
        </button>
      </div>

      {showMiniProfileFor && (
        <MiniProfileSheet userId={showMiniProfileFor} onClose={() => setShowMiniProfileFor(null)} />
      )}

      {showParticipants && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30" onClick={() => setShowParticipants(false)}>
          <div className="rounded-t-sheet bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <h2 className="text-title mb-4">Участники ({members.length + 1})</h2>
            <div className="space-y-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setShowParticipants(false);
                    setShowMiniProfileFor(m.id);
                  }}
                  className="flex w-full items-center gap-3 rounded-card p-2 text-left hover:bg-lavender-50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-sm font-semibold text-ink-600">
                    {m.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      m.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="font-medium text-ink-900">{m.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {loading && <p className="text-center text-ink-600">Загрузка...</p>}
        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {messages.map((message, index) => {
          const prev = messages[index - 1];
          const showDaySeparator = !prev || !isSameDay(prev.createdAt, message.createdAt);
          const isOwn = message.senderId === myUserId;
          const isRead =
            members.length > 0 && members.every((m) => m.lastReadAt && message.createdAt <= m.lastReadAt);
          const sender = members.find((m) => m.id === message.senderId);
          const showSenderLabel = !isOwn && (!prev || prev.senderId !== message.senderId || showDaySeparator);

          return (
            <div key={message.id}>
              {showDaySeparator && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-pill bg-lavender-100 px-3 py-1 text-[11px] font-medium text-ink-600">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
              )}
              {showSenderLabel && (
                <p className="mb-1 ml-1 text-xs font-medium text-ink-600">{sender?.name ?? "Участник"}</p>
              )}
              <MessageBubble message={message} isOwn={isOwn} readStatus={isRead ? "read" : "sent"} />
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-lavender-100 bg-white p-3">
        {isEventClosed ? (
          <p className="w-full text-center text-sm text-ink-400">
            Событие закрыто — отправка новых сообщений недоступна.
          </p>
        ) : (
          <>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              placeholder="Написать сообщение..."
              className="min-w-0 flex-1 rounded-pill border border-lavender-200 bg-background px-4 py-2.5 text-base outline-none focus:border-accent"
            />
            <button
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient disabled:opacity-40"
              aria-label="Отправить"
            >
              <Image
                src="/brand/icons/send.svg"
                alt=""
                width={18}
                height={18}
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function isSameDay(isoA: string, isoB: string): boolean {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
ENDOFFILE

