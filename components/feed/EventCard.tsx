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
