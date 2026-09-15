mkdir -p "components/profile"
cat > "components/profile/AvatarViewer.tsx" << 'ENDOFFILE'
"use client";

import { useState } from "react";

interface AvatarViewerProps {
  src: string;
  alt: string;
  children: React.ReactNode;
}

/**
 * Оборачивает аватар: клик открывает фото на весь экран (тап — закрыть),
 * как в Instagram. Чисто фронтенд-функция, не требует изменений в БД.
 */
export function AvatarViewer({ src, alt, children }: AvatarViewerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="contents" aria-label="Открыть фото">
        {children}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-full max-w-full rounded-2xl object-contain" />
        </div>
      )}
    </>
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
      id, title, event_date, event_time, place_name, status,
      category:categories(slug, name, emoji)
      `
    )
    .in("id", eventIds)
    .order("event_date", { ascending: false });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const items = (events ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    eventDate: e.event_date,
    eventTime: e.event_time,
    placeName: e.place_name,
    status: e.status,
    category: e.category,
    role: roleByEventId.get(e.id) === "organizer" ? "organizer" : "participant",
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
                </div>
              ) : (
                <span className="text-2xl">{event.category?.emoji}</span>
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

mkdir -p "app/api/me/profile"
cat > "app/api/me/profile/route.ts" << 'ENDOFFILE'
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/me/profile
 * Полный профиль текущего пользователя — для экрана "Профиль" (п.21 ТЗ).
 * Отдельно от /api/me (который отдаёт только userId для чата), чтобы не
 * тащить лишние данные туда, где нужен просто идентификатор.
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: user, error } = await admin
    .from("users")
    .select("id, name, avatar_url, birth_date, city, bio, rating_avg, rating_count, completed_meetings_count, created_at")
    .eq("id", currentUser.userId)
    .maybeSingle();

  if (error || !user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [{ count: eventsOrganizedCount }, { count: eventsAttendedCount }] = await Promise.all([
    admin.from("events").select("*", { count: "exact", head: true }).eq("organizer_id", currentUser.userId),
    admin
      .from("event_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", currentUser.userId)
      .eq("role", "participant"),
  ]);

  return NextResponse.json({
    id: user.id,
    name: user.name,
    avatarUrl: user.avatar_url,
    age: calculateAge(user.birth_date),
    city: user.city,
    bio: user.bio,
    ratingAvg: user.rating_avg,
    ratingCount: user.rating_count,
    completedMeetingsCount: user.completed_meetings_count,
    eventsOrganizedCount: eventsOrganizedCount ?? 0,
    eventsAttendedCount: eventsAttendedCount ?? 0,
    memberSince: user.created_at,
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
 * PATCH /api/me/profile
 * Body: { name?: string, bio?: string }
 * Минимальное редактирование профиля — имя и "о себе" (единственные
 * текстовые поля, которые у нас реально есть; смена города/даты рождения
 * не поддержана нарочно, это отдельная задача с более серьёзной проверкой).
 */
export async function PATCH(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const update: Record<string, string> = {};

  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 50) {
      return NextResponse.json({ error: "invalid_name" }, { status: 422 });
    }
    update.name = name;
  }

  if (typeof body?.bio === "string") {
    const bio = body.bio.trim();
    if (bio.length > 300) return NextResponse.json({ error: "bio_too_long" }, { status: 422 });
    update.bio = bio;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("users").update(update).eq("id", currentUser.userId);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  return NextResponse.json({ status: "ok" });
}
ENDOFFILE

mkdir -p "app/(app)/profile"
cat > "app/(app)/profile/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { type Plan } from "@/lib/subscriptions/limits";
import { AvatarViewer } from "@/components/profile/AvatarViewer";

interface Profile {
  name: string;
  avatarUrl: string | null;
  age: number;
  city: string;
  bio: string | null;
  ratingAvg: number;
  ratingCount: number;
  completedMeetingsCount: number;
  eventsOrganizedCount: number;
  eventsAttendedCount: number;
  memberSince: string;
}

interface SubscriptionStatus {
  active: boolean;
  plan?: Plan;
  periodEnd?: string;
}

const PLAN_TITLES: Record<Plan, string> = { start: "Старт", medium: "Медиум", premium: "Премьер" };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/me/profile").then((r) => r.json()),
      fetch("/api/subscriptions").then((r) => r.json()),
    ])
      .then(([profileData, subData]) => {
        if (!profileData.error) {
          setProfile(profileData);
          setEditName(profileData.name);
          setEditBio(profileData.bio ?? "");
        }
        setSubscription(subData);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <p className="text-ink-600">Загрузка...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6 text-center">
        <p className="text-ink-600">Не удалось загрузить профиль.</p>
      </div>
    );
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Файл больше 5 МБ — выбери другое фото.");
      setTimeout(() => setUploadError(null), 3000);
      return;
    }

    setUploadingPhoto(true);
    setUploadError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoBase64: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError("Не получилось загрузить фото.");
        return;
      }
      setProfile((prev) => (prev ? { ...prev, avatarUrl: data.avatarUrl } : prev));
    } catch {
      setUploadError("Проблема с соединением.");
    } finally {
      setUploadingPhoto(false);
      setTimeout(() => setUploadError(null), 3000);
    }
  }

  async function saveEdit() {
    setSavingEdit(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, bio: editBio }),
      });
      if (res.ok) {
        setProfile((prev) => (prev ? { ...prev, name: editName, bio: editBio } : prev));
        setEditing(false);
      }
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="px-5 py-6">
      <div className="mb-2 flex justify-end">
        <Link href="/settings" aria-label="Настройки">
          <Image src="/brand/icons/settings.svg" alt="" width={22} height={22} />
        </Link>
      </div>

      <div className="mb-4 flex flex-col items-center text-center">
        <div className="relative mb-3">
          {profile.avatarUrl ? (
            <AvatarViewer src={profile.avatarUrl} alt={profile.name}>
              <div className="h-24 w-24 overflow-hidden rounded-full bg-white shadow-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={profile.avatarUrl} alt={profile.name} className="h-full w-full object-cover" />
              </div>
            </AvatarViewer>
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-2xl font-semibold text-ink-600 shadow-card">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm text-white shadow-card active:scale-95"
            aria-label="Изменить фото"
          >
            {uploadingPhoto ? "…" : "✏️"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelected}
          />
        </div>

        <h1 className="text-title">
          {profile.name}, {profile.age}
        </h1>
        <p className="mt-1 flex items-center gap-1 text-sm text-ink-600">
          <Image src="/brand/icons/location.svg" alt="" width={14} height={14} />
          {profile.city}
        </p>
        {profile.ratingCount > 0 && (
          <p className="mt-1 flex items-center gap-1 text-sm text-ink-600">
            <Image src="/brand/icons/star.svg" alt="" width={14} height={14} />
            {profile.ratingAvg.toFixed(1)} ({profile.ratingCount}{" "}
            {pluralize(profile.ratingCount, "оценка", "оценки", "оценок")})
          </p>
        )}

        <button
          onClick={() => setEditing((v) => !v)}
          className="mt-3 rounded-pill bg-lavender-100 px-5 py-2 text-sm font-medium text-accent"
        >
          Редактировать профиль
        </button>
      </div>

      {editing && (
        <div className="mb-5 space-y-2 rounded-card bg-white p-4 shadow-card">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Имя"
            maxLength={50}
            className="w-full min-w-0 box-border rounded-card border border-lavender-200 bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <textarea
            value={editBio}
            onChange={(e) => setEditBio(e.target.value)}
            placeholder="О себе"
            maxLength={300}
            rows={3}
            className="w-full min-w-0 box-border resize-none rounded-card border border-lavender-200 bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="flex-1 rounded-pill border border-lavender-200 bg-white py-2.5 text-sm font-medium text-ink-600"
            >
              Отмена
            </button>
            <button
              onClick={saveEdit}
              disabled={savingEdit || editName.trim().length < 2}
              className="flex-1 rounded-pill bg-brand-gradient py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingEdit ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </div>
      )}

      {uploadError && <p className="mb-4 text-center text-sm text-red-600">{uploadError}</p>}

      {!editing && profile.bio && <p className="mb-6 text-center text-sm text-ink-900">{profile.bio}</p>}

      <div className="mb-6 grid grid-cols-3 gap-2 rounded-card-lg bg-white py-4 shadow-card">
        <StatItem value={String(profile.eventsOrganizedCount)} label="создано" />
        <StatItem value={String(profile.eventsAttendedCount)} label="посещено" />
        <StatItem value={String(profile.completedMeetingsCount)} label="состоялось" />
      </div>

      <div className="space-y-1.5 rounded-card-lg bg-white p-1.5 shadow-card">
        <MenuRow href="/my-events" icon="/brand/icons/calendar.svg" label="Мои встречи" />
        <MenuRow href="/notifications" icon="/brand/icons/bell.svg" label="Уведомления" />
        <MenuRow
          href="/subscriptions"
          icon="/brand/icons/gift.svg"
          label="Подписка"
          value={subscription?.active ? PLAN_TITLES[subscription.plan!] : "не оформлена"}
        />
        <MenuRow href="/reviews" icon="/brand/icons/star.svg" label="Отзывы после встреч" />
      </div>
    </div>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold text-ink-900">{value}</div>
      <div className="text-xs text-ink-600">{label}</div>
    </div>
  );
}

function MenuRow({
  href,
  icon,
  label,
  value,
}: {
  href: string;
  icon: string;
  label: string;
  value?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-card px-3 py-3">
      <Image src={icon} alt="" width={18} height={18} />
      <span className="flex-1 text-sm text-ink-900">{label}</span>
      {value && <span className="text-sm text-ink-400">{value}</span>}
      <span className="text-ink-400">›</span>
    </Link>
  );
}

function pluralize(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return few;
  return many;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
ENDOFFILE

