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
      id, title, event_date, event_time, place_name, status,
      category:categories(slug, name, emoji)
      `
    )
    .in("id", eventIds)
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
    role: roleByEventId.get(e.id) === "organizer" ? "organizer" : "participant",
    pendingApplicationsCount: pendingCountByEventId.get(e.id) ?? 0,
    pendingApplicantPreview: pendingPreviewByEventId.get(e.id) ?? null,
  }));

  return NextResponse.json({ items });
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
      <div className="mb-4 flex items-center gap-3">
        <Link href="/profile" aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </Link>
        <h1 className="text-title">Мои встречи</h1>
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
          const icon = event.category ? CATEGORY_ICON[event.category.slug] : undefined;
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
  seatsTotal: number;
  seatsTaken: number;
  status: string;
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

  const categoryLabel = event.trainingType?.name ?? event.category?.name;
  const categoryIcon = event.category ? CATEGORY_ICON[event.category.slug] : undefined;
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
            {formatDate(event.eventDate)} · {event.eventTime.slice(0, 5)}
          </p>
          {event.placeName && (
            <p>
              {event.placeName}
              {event.address ? `, ${event.address}` : ""}
            </p>
          )}
          <p>{isFull ? "Мест нет" : `Свободно мест: ${seatsLeft} из ${event.seatsTotal}`}</p>
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

        {event.viewerStatus === "organizer" && event.status === "published" && (
          <div className="mb-3 space-y-3">
            {pendingApplicants.length > 0 && (
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

            <button
              onClick={handleBoost}
              disabled={boosting}
              className="flex w-full items-center justify-center gap-2 rounded-pill bg-brand-gradient py-3 text-sm font-semibold text-white shadow-cta disabled:opacity-60"
            >
              <span className="text-lg">🚀</span>
              {boosting ? "Поднимаем..." : "Поднять встречу"}
            </button>
            {boostMessage && <p className="text-center text-xs text-ink-600">{boostMessage}</p>}

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

      {event.status === "published" && (
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

