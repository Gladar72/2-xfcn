"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { type Plan } from "@/lib/subscriptions/limits";
import { AvatarViewer } from "@/components/profile/AvatarViewer";
import { resizeImageFile } from "@/lib/photos/resize-image-client";
import { useVisualViewportHeight } from "@/lib/hooks/use-visual-viewport-height";
import { RatingStar } from "@/components/ui/RatingStar";
import { photoThumb } from "@/lib/photos/thumb";

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
  const viewportHeight = useVisualViewportHeight();
  const [navHeight, setNavHeight] = useState(96);

  // Профиль — экран без скролла: блокируем прокрутку документа, пока открыта
  // страница, и меряем реальную высоту нижнего меню (с учётом safe-area),
  // чтобы контент занял ровно оставшееся место.
  useEffect(() => {
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    const prevOverscroll = html.style.overscrollBehavior;
    const prevBodyOverflow = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    window.scrollTo(0, 0);

    const nav = document.querySelector("nav");
    let ro: ResizeObserver | null = null;
    if (nav) {
      const update = () => setNavHeight(nav.getBoundingClientRect().height);
      update();
      ro = new ResizeObserver(update);
      ro.observe(nav);
    }
    return () => {
      html.style.overflow = prevOverflow;
      html.style.overscrollBehavior = prevOverscroll;
      document.body.style.overflow = prevBodyOverflow;
      ro?.disconnect();
    };
  }, []);

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
      const dataUrl = await resizeImageFile(file, 1600, 0.82);
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoBase64: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(
          data.error === "photo_rejected" ? "Это фото не прошло проверку — выбери другое." : "Не получилось загрузить фото."
        );
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
    // Профиль целиком помещается в один экран: высота = видимая область минус
    // реальная высота нижнего меню. Ничего не скроллится; на низких экранах
    // (iPhone SE и т.п.) элементы ужимаются через max-height-медиазапросы.
    <div
      className="relative flex flex-col gap-3 overflow-hidden px-4 pb-3 pt-3 [@media(max-height:680px)]:gap-2"
      style={{
        height: viewportHeight && !editing ? `${viewportHeight - navHeight}px` : `calc(100dvh - ${navHeight}px)`,
      }}
    >
      <Link
        href="/settings"
        aria-label="Настройки"
        className="absolute right-4 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/60 backdrop-blur"
      >
        <Image src="/brand/icons/settings.svg" alt="" width={20} height={20} />
      </Link>

      {/* Шапка: аватар, имя, город/рейтинг, bio, кнопка — занимает всё свободное место и центрируется */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
        <div className="relative mb-3 [@media(max-height:680px)]:mb-2">
          <div className="absolute inset-0 -z-10 scale-110 rounded-full bg-white/50 blur-xl" aria-hidden />
          {profile.avatarUrl ? (
            <AvatarViewer src={profile.avatarUrl} alt={profile.name}>
              <div className="h-[104px] w-[104px] overflow-hidden rounded-full bg-white ring-4 ring-white/80 shadow-card [@media(max-height:680px)]:h-[76px] [@media(max-height:680px)]:w-[76px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoThumb(profile.avatarUrl, 128)} alt={profile.name} className="h-full w-full object-cover" />
              </div>
            </AvatarViewer>
          ) : (
            <div className="flex h-[104px] w-[104px] items-center justify-center rounded-full bg-white text-3xl font-semibold text-ink-600 ring-4 ring-white/80 shadow-card [@media(max-height:680px)]:h-[76px] [@media(max-height:680px)]:w-[76px]">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="absolute -bottom-0.5 -right-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-sm text-white ring-[3px] ring-white shadow-card active:scale-95 disabled:opacity-70"
            aria-label="Изменить фото"
          >
            {uploadingPhoto ? "…" : <Image src="/brand/3d/icon-edit.png" alt="" width={20} height={20} />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelected} />
        </div>

        <h1 className="max-w-full truncate px-10 text-2xl font-bold leading-tight text-ink-900 [@media(max-height:680px)]:text-title">
          {profile.name}, {profile.age}
        </h1>

        <p className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-sm text-ink-600">
          <span className="flex items-center gap-1">
            <Image src="/brand/3d/icon-location.png" alt="" width={16} height={16} />
            {profile.city}
          </span>
          {profile.ratingCount > 0 && (
            <span className="flex items-center gap-1">
              <RatingStar size={16} />
              {profile.ratingAvg.toFixed(1)}
              <span className="text-ink-400">
                ({profile.ratingCount} {pluralize(profile.ratingCount, "оценка", "оценки", "оценок")})
              </span>
            </span>
          )}
        </p>

        {profile.bio && (
          <p className="mt-2 line-clamp-2 max-w-[300px] text-sm leading-snug text-ink-900 [@media(max-height:680px)]:line-clamp-1">
            {profile.bio}
          </p>
        )}

        {uploadError && <p className="mt-1.5 text-sm text-red-600">{uploadError}</p>}

        <button
          onClick={() => setEditing(true)}
          className="mt-3 rounded-pill bg-white/70 px-8 py-2.5 text-sm font-semibold text-accent shadow-card backdrop-blur active:scale-[0.98] [@media(max-height:680px)]:mt-2 [@media(max-height:680px)]:py-2"
        >
          Редактировать профиль
        </button>
      </div>

      {/* Статистика */}
      <div className="grid shrink-0 grid-cols-3 gap-2.5">
        <StatCard value={profile.eventsOrganizedCount} label="создано" icon={<PlusTile />} />
        <StatCard
          value={profile.eventsAttendedCount}
          label="посещено"
          icon={<Image src="/brand/3d/icon-users.png" alt="" width={22} height={22} />}
        />
        <StatCard
          value={profile.completedMeetingsCount}
          label="состоялось"
          icon={<HeartIcon />}
          tileClass="bg-pink-100"
        />
      </div>

      {/* Мои разделы */}
      <div className="shrink-0 rounded-[26px] bg-white/85 px-4 py-1.5 shadow-card backdrop-blur">
        <MenuRow href="/my-events" icon="/brand/3d/icon-calendar.png" label="Мои встречи" />
        <MenuRow href="/notifications" icon="/brand/3d/icon-bell.png" label="Уведомления" />
        <MenuRow
          href="/subscriptions"
          icon="/brand/3d/icon-gift.png"
          label="Подписка"
          value={subscription?.active ? PLAN_TITLES[subscription.plan!] : "не оформлена"}
        />
        <MenuRow href="/reviews" icon="/brand/3d/icon-badge.png" label="Отзывы после встреч" last />
      </div>

      {/* Редактирование — модальное окно поверх, чтобы не раздувать экран */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 px-4 backdrop-blur-sm"
          onClick={() => !savingEdit && setEditing(false)}
        >
          <div
            className="w-full max-w-sm space-y-2.5 rounded-card-lg bg-white p-4 shadow-card-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="pb-1 text-center text-title text-ink-900">Редактировать профиль</h2>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Имя"
              maxLength={50}
              className="box-border w-full min-w-0 rounded-card border border-lavender-200 bg-background px-3 py-2 text-base outline-none focus:border-accent"
            />
            <textarea
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              placeholder="О себе"
              maxLength={300}
              rows={3}
              className="box-border w-full min-w-0 resize-none rounded-card border border-lavender-200 bg-background px-3 py-2 text-base outline-none focus:border-accent"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  setEditName(profile.name);
                  setEditBio(profile.bio ?? "");
                  setEditing(false);
                }}
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
        </div>
      )}
    </div>
  );
}

function StatCard({
  value,
  label,
  icon,
  tileClass = "bg-lavender-100",
}: {
  value: number;
  label: string;
  icon: React.ReactNode;
  tileClass?: string;
}) {
  return (
    <div className="relative min-w-0 rounded-[22px] bg-white/80 px-3 py-2.5 shadow-card backdrop-blur [@media(max-height:680px)]:py-2">
      <div
        className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-[10px] ${tileClass}`}
        aria-hidden
      >
        {icon}
      </div>
      <div className="text-2xl font-bold leading-7 text-ink-900">{value}</div>
      <div className="mt-1 truncate text-xs text-ink-600">{label}</div>
    </div>
  );
}

function PlusTile() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-[7px] bg-brand-gradient text-sm font-bold leading-none text-white">
      +
    </span>
  );
}

function HeartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="profile-heart" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF7AB6" />
          <stop offset="100%" stopColor="#F2386E" />
        </linearGradient>
      </defs>
      <path
        fill="url(#profile-heart)"
        d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.1 0 3.6 1.1 4.4 2.4.8-1.3 2.3-2.4 4.4-2.4 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z"
      />
    </svg>
  );
}

function MenuRow({
  href,
  icon,
  label,
  value,
  last = false,
}: {
  href: string;
  icon: string;
  label: string;
  value?: string;
  last?: boolean;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 active:opacity-70">
      <Image unoptimized
        src={icon}
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 object-contain [@media(max-height:680px)]:h-8 [@media(max-height:680px)]:w-8"
      />
      <div
        className={`flex min-w-0 flex-1 items-center gap-2 py-3.5 [@media(max-height:680px)]:py-2.5 ${last ? "" : "border-b border-lavender-100"}`}
      >
        <span className="flex-1 truncate text-base text-ink-900">{label}</span>
        {value && <span className="shrink-0 text-sm text-ink-400">{value}</span>}
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-ink-400">
          <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
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
