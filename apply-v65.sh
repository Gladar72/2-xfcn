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
  // не только общим уведомлением.
  const organizerEventIds = eventIds.filter((id) => roleByEventId.get(id) === "organizer");
  const pendingCountByEventId = new Map<string, number>();
  if (organizerEventIds.length > 0) {
    const { data: pendingApplications } = await admin
      .from("applications")
      .select("event_id")
      .in("event_id", organizerEventIds)
      .eq("status", "pending");
    for (const a of pendingApplications ?? []) {
      pendingCountByEventId.set(a.event_id, (pendingCountByEventId.get(a.event_id) ?? 0) + 1);
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
                </div>
              ) : (
                <div className="relative shrink-0">
                  <span className="text-2xl">{event.category?.emoji}</span>
                  {event.pendingApplicationsCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-red-500 px-1 text-[10px] font-semibold text-white">
                      {event.pendingApplicationsCount}
                    </span>
                  )}
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
ENDOFFILE

