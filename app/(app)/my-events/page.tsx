"use client";

import { useEffect, useState } from "react";
import { CATEGORY_ICON } from "@/lib/data/category-icons";
import { useGuide } from "@/lib/mosya/guide";
import Link from "next/link";
import Image from "next/image";
import { photoThumb } from "@/lib/photos/thumb";

interface MyEvent {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  placeName: string | null;
  status: string;
  category: { slug: string; name: string; emoji: string | null } | null;
  isBusiness: boolean;
  photoUrl: string | null;
  role: "organizer" | "participant";
  pendingApplicationsCount: number;
  pendingApplicantPreview: { id: string; name: string; avatarUrl: string | null } | null;
}


const DEFAULT_ICON = "/brand/cat3d/i_world.webp";

type Scope = "upcoming" | "archive";

const STATUS_LABEL: Record<string, string> = {
  published: "Активна",
  closed: "Встреча забита",
  completed: "Завершена",
  cancelled: "Отменена",
};

export default function MyEventsPage() {
  const [scope, setScope] = useState<Scope>("upcoming");
  const [items, setItems] = useState<MyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  useGuide("myEvents");
  // Полоса календаря на 2 недели: точки — дни со встречами, тап — фильтр по дню.
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setItems([]);
    fetch(`/api/me/events?scope=${scope}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return (
    <div className="px-5 py-4">
      <h1 className="m-title mb-4">Мои встречи</h1>

      <div className="mb-4 flex gap-2">
        <Link
          href="/search"
          className="flex-1 rounded-pill m-glass px-4 py-2 text-center text-sm font-medium text-ink-900"
        >
          Все встречи
        </Link>
        <span className="flex-1 rounded-pill bg-ink-900 px-4 py-2 text-center text-sm font-medium text-white">
          Мои встречи
        </span>
      </div>

      {/* Предстоящие / Архив */}
      <div className="m-glass mb-4 flex rounded-pill p-1">
        {(
          [
            ["upcoming", "Предстоящие"],
            ["archive", "Архив"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setScope(value)}
            className={`flex-1 rounded-pill py-1.5 text-sm font-medium transition-colors ${
              scope === value ? "bg-ink-900 text-white" : "text-ink-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {scope === "upcoming" && (
        <div className="-mx-5 mb-4 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {Array.from({ length: 14 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() + i);
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const has = items.some((e) => e.eventDate.slice(0, 10) === iso);
            const on = day === iso;
            return (
              <button
                key={iso}
                onClick={() => setDay(on ? null : iso)}
                className={`m-press relative flex h-[62px] w-[46px] shrink-0 flex-col items-center justify-center rounded-[18px] ${
                  on ? "bg-ink-900 text-white" : i === 0 ? "bg-white/90 shadow-[inset_0_0_0_2px_#9B5CFF]" : "m-glass"
                }`}
              >
                <span className={`text-[11px] ${on ? "text-white/70" : "text-ink-400"}`}>
                  {d.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "")}
                </span>
                <b className="text-[17px] font-medium leading-tight">{d.getDate()}</b>
                {has && <span className={`absolute bottom-1.5 h-1.5 w-1.5 rounded-full ${on ? "bg-white" : "bg-accent"}`} />}
              </button>
            );
          })}
        </div>
      )}

      {loading && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="m-sk h-24" />)}</div>}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <div className="relative mb-4 h-28 w-28">
            <Image src="/brand/mosya/mosya_think.webp" alt="" fill className="object-contain" sizes="112px" />
          </div>
          <p className="text-sm text-ink-600">
            {scope === "archive"
              ? "Прошедших встреч пока нет."
              : "Предстоящих встреч нет — загляни в ленту или создай свою."}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {items
          .filter((e) => scope !== "upcoming" || !day || e.eventDate.slice(0, 10) === day)
          .map((event) => {
          const icon = event.isBusiness
            ? CATEGORY_ICON.business ?? DEFAULT_ICON
            : (event.category && CATEGORY_ICON[event.category.slug]) || DEFAULT_ICON;
          const isPast = scope === "archive";
          return (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className={`m-glass m-press flex items-center gap-3 rounded-[22px] p-3 ${isPast ? "opacity-75" : ""}`}
            >
              <div className="relative h-12 w-12 shrink-0">
                {event.photoUrl ? (
                  <div className={`h-12 w-12 overflow-hidden rounded-[14px] bg-lavender-100 ${isPast ? "grayscale" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoThumb(event.photoUrl, 48)} alt="" className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-lavender-100">
                    <Image src={icon} alt="" width={36} height={36} className="h-9 w-9 object-contain" />
                  </div>
                )}
                {event.pendingApplicationsCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-red-500 px-1 text-caption font-semibold text-white">
                    {event.pendingApplicationsCount}
                  </span>
                )}
                <ApplicantPreviewBadge preview={event.pendingApplicantPreview} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{event.title}</p>
                <p className="truncate text-xs text-ink-600">
                  {formatDate(event.eventDate)} · {event.eventTime.slice(0, 5)}
                  {event.placeName ? ` · ${event.placeName}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="block text-caption font-medium text-accent">
                  {event.role === "organizer" ? "Организатор" : "Участник"}
                </span>
                <span className="block text-caption text-ink-400">{STATUS_LABEL[event.status] ?? event.status}</span>
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
    <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-lavender-100 text-caption font-semibold text-ink-600">
      {preview.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoThumb(preview.avatarUrl, 24)} alt={preview.name} className="h-full w-full object-cover" />
      ) : (
        <span>+</span>
      )}
    </div>
  );
}
