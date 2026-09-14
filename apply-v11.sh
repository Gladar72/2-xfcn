mkdir -p "app/api/events/[id]"
cat > "app/api/events/[id]/route.ts" << 'ENDOFFILE'
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/telegram/current-user";

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
      event_date, event_time, seats_total, seats_taken, status, organizer_id,
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
    seatsTotal: event.seats_total,
    seatsTaken: event.seats_taken,
    status: event.status,
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
ENDOFFILE

mkdir -p "app/(app)/events/[id]"
cat > "app/(app)/events/[id]/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

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

  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError("Встреча не найдена.");
          return;
        }
        setEvent(data);
      })
      .finally(() => setLoading(false));
  }, [eventId]);

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
              : "Не получилось отправить отклик."
        );
        return;
      }
      setEvent((prev) => (prev ? { ...prev, viewerStatus: "pending" } : prev));
    } finally {
      setApplying(false);
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
      </div>

      <div className="fixed inset-x-0 bottom-24 z-40 px-5">
        <BottomAction
          viewerStatus={event.viewerStatus}
          isFull={isFull}
          applying={applying}
          onApply={handleApply}
          eventId={event.id}
        />
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

mkdir -p "app"
cat > "app/globals.css" << 'ENDOFFILE'
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body {
  max-width: 100vw;
  overflow-x: hidden;
}

/* Скрываем необязательную кнопку "Открыть Яндекс Карты" — это удобство,
   а не обязательная атрибуция. Условия использования (обязательная ссылка,
   класс ymaps3--map-copyrights__user-agreements) остаются на месте. */
.ymaps3--controls_bottom.ymaps3--controls_left.ymaps3--controls_horizontal {
  display: none !important;
}
ENDOFFILE

mkdir -p "app/(app)/map"
cat > "app/(app)/map/page.tsx" << 'ENDOFFILE'
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { EventsMap, type MapEventItem } from "@/components/map/EventsMap";

export default function MapPage() {
  return (
    <Suspense>
      <MapPageContent />
    </Suspense>
  );
}

function MapPageContent() {
  const searchParams = useSearchParams();
  const cityOverride = searchParams.get("city"); // позволяет посмотреть карту другого города по ссылке — заодно удобно для отладки

  const [events, setEvents] = useState<MapEventItem[]>([]);
  const [selected, setSelected] = useState<MapEventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load(isRetry = false) {
    setLoading(true);
    setError(null);
    const query = cityOverride ? `?city=${encodeURIComponent(cityOverride)}` : "";
    fetch(`/api/events/map${query}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          // "Не удалось загрузить карту" бывает из-за редких кратковременных
          // сбоев соединения с базой — один автоматический повтор решает
          // подавляющее большинство таких случаев без участия пользователя.
          if (data.error !== "city_required" && !isRetry) {
            setTimeout(() => load(true), 800);
            return;
          }
          setError(data.error === "city_required" ? "Сначала заверши регистрацию." : "Не удалось загрузить карту.");
          return;
        }
        setEvents(data.items ?? []);
      })
      .catch(() => {
        if (!isRetry) {
          setTimeout(() => load(true), 800);
          return;
        }
        setError("Проблема с соединением.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityOverride]);

  return (
    <div className="relative h-[calc(100vh-5rem)]">
      {error ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-red-600">{error}</p>
          {error !== "Сначала заверши регистрацию." && (
            <button
              onClick={() => load()}
              className="rounded-pill bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white shadow-cta active:scale-95"
            >
              Попробовать снова
            </button>
          )}
        </div>
      ) : loading && events.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-ink-600">Загрузка карты...</div>
      ) : (
        <EventsMap events={events} onSelect={setSelected} />
      )}

      {selected && (
        <div className="fixed inset-x-0 bottom-20 z-50 max-h-[50vh] overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-card">
          <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" onClick={() => setSelected(null)} />
          <h2 className="text-title mb-3">Встречи здесь</h2>
          <div className="space-y-2">
            {selected.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="flex items-center gap-3 rounded-card bg-background p-3"
              >
                <span className="text-xl">{event.category?.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{event.title}</p>
                  <p className="truncate text-xs text-ink-600">
                    {formatDate(event.eventDate)} · {event.eventTime.slice(0, 5)}
                    {event.placeName ? ` · ${event.placeName}` : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
ENDOFFILE

mkdir -p "components/feed"
cat > "components/feed/EventCard.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";

export interface EventCardData {
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
  organizer: {
    id: string;
    name: string;
    avatarUrl: string | null;
    age: number;
    ratingAvg: number;
    completedMeetingsCount: number;
  } | null;
}

interface EventCardProps {
  event: EventCardData;
  onApplyPress?: (eventId: string) => void;
  applied?: boolean;
  applying?: boolean;
}

// 3D-иконки категорий МЕСТО (тот же комплект, что и на главном экране).
const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/3d/workout.png",
  cinema: "/brand/3d/movie.png",
  coffee: "/brand/3d/coffee.png",
  breakfast: "/brand/3d/breakfast.png",
  dinner: "/brand/3d/dinner.png",
  walk: "/brand/3d/walk.png",
  custom: "/brand/3d/custom-proposal.png",
};

export function EventCard({ event, onApplyPress, applied = false, applying = false }: EventCardProps) {
  const seatsLeft = event.seatsTotal - event.seatsTaken;
  const isFull = seatsLeft <= 0;
  const isDisabled = isFull || applied || applying;
  const categoryLabel = event.trainingType?.name ?? event.category?.name;
  const categoryEmoji = event.trainingType?.emoji ?? event.category?.emoji;
  const categoryIcon = event.category ? CATEGORY_ICON[event.category.slug] : undefined;

  return (
    <Link href={`/events/${event.id}`} className="block rounded-card bg-white p-4 shadow-card">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-accent">
        {categoryIcon ? (
          <div className="relative h-4 w-4 shrink-0">
            <Image src={categoryIcon} alt="" fill className="object-contain" sizes="16px" />
          </div>
        ) : (
          <span>{categoryEmoji}</span>
        )}
        <span>{categoryLabel}</span>
      </div>

      <h3 className="text-title mb-1">{event.title}</h3>

      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-600">
        <span>{formatDate(event.eventDate)}</span>
        <span>{formatTime(event.eventTime)}</span>
        {event.placeName && <span>{event.placeName}</span>}
      </div>

      {event.description && (
        <p className="mb-3 line-clamp-2 text-sm text-ink-600">{event.description}</p>
      )}

      {event.organizer && (
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-background text-sm font-semibold text-ink-600">
            {event.organizer.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.organizer.avatarUrl} alt={event.organizer.name} className="h-full w-full object-cover" />
            ) : (
              event.organizer.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="text-sm">
            <span className="font-medium text-ink-900">{event.organizer.name}</span>
            <span className="text-ink-400">, {event.organizer.age}</span>
            {event.organizer.ratingAvg > 0 && (
              <span className="ml-2 text-ink-600">
                ⭐ {event.organizer.ratingAvg.toFixed(1)} · {event.organizer.completedMeetingsCount} встреч
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-600">
          {isFull ? "Мест нет" : `Нужно ещё ${seatsLeft} чел.`}
        </span>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onApplyPress?.(event.id);
          }}
          disabled={isDisabled}
          className={clsx(
            "rounded-pill px-5 py-2 text-sm font-semibold",
            isDisabled ? "bg-ink-400/10 text-ink-400" : "bg-brand-gradient text-white shadow-cta active:scale-95"
          )}
        >
          {applied ? "Отклик отправлен" : applying ? "Отправляем..." : "Я иду"}
        </button>
      </div>
    </Link>
  );
}

function formatDate(dateIso: string): string {
  const date = new Date(dateIso);
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function formatTime(timeString: string): string {
  return timeString.slice(0, 5);
}
ENDOFFILE

