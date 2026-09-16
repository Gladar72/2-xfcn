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
