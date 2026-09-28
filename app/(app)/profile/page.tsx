"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { type Plan } from "@/lib/subscriptions/limits";
import { AvatarViewer } from "@/components/profile/AvatarViewer";
import { resizeImageFile } from "@/lib/photos/resize-image-client";

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
    <div className="px-4 pb-6 pt-4">
      <div className="mb-1 flex justify-end">
        <Link
          href="/settings"
          aria-label="Настройки"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/60 backdrop-blur"
        >
          <Image src="/brand/icons/settings.svg" alt="" width={20} height={20} />
        </Link>
      </div>

      {/* Шапка: аватар, имя, город, рейтинг */}
      <div className="mb-5 flex flex-col items-center text-center">
        <div className="relative mb-4">
          <div className="absolute inset-0 -z-10 scale-110 rounded-full bg-white/50 blur-xl" aria-hidden />
          {profile.avatarUrl ? (
            <AvatarViewer src={profile.avatarUrl} alt={profile.name}>
              <div className="h-[120px] w-[120px] overflow-hidden rounded-full bg-white ring-4 ring-white/80 shadow-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={profile.avatarUrl} alt={profile.name} className="h-full w-full object-cover" />
              </div>
            </AvatarViewer>
          ) : (
            <div className="flex h-[120px] w-[120px] items-center justify-center rounded-full bg-white text-3xl font-semibold text-ink-600 ring-4 ring-white/80 shadow-card">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="absolute -bottom-0.5 -right-0.5 flex h-11 w-11 items-center justify-center rounded-full bg-brand-gradient text-sm text-white ring-[3px] ring-white shadow-card active:scale-95 disabled:opacity-70"
            aria-label="Изменить фото"
          >
            {uploadingPhoto ? "…" : <Image src="/brand/3d/icon-edit.png" alt="" width={24} height={24} />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelected}
          />
        </div>

        <h1 className="text-[26px] font-bold leading-tight text-ink-900">
          {profile.name}, {profile.age}
        </h1>
        <p className="mt-1.5 flex items-center gap-1.5 text-base text-ink-600">
          <Image src="/brand/3d/icon-location.png" alt="" width={18} height={18} />
          {profile.city}
        </p>
        {profile.ratingCount > 0 && (
          <p className="mt-1 flex items-center gap-1.5 text-base text-ink-600">
            <Image src="/brand/icons/star.svg" alt="" width={18} height={18} />
            {profile.ratingAvg.toFixed(1)} ({profile.ratingCount}{" "}
            {pluralize(profile.ratingCount, "оценка", "оценки", "оценок")})
          </p>
        )}

        <button
          onClick={() => setEditing((v) => !v)}
          className="mt-4 rounded-pill bg-white/70 px-12 py-3 text-base font-semibold text-accent shadow-card backdrop-blur active:scale-[0.98]"
        >
          Редактировать профиль
        </button>
      </div>

      {editing && (
        <div className="mb-5 space-y-2 rounded-card-lg bg-white/85 p-4 shadow-card backdrop-blur">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Имя"
            maxLength={50}
            className="w-full min-w-0 box-border rounded-card border border-lavender-200 bg-background px-3 py-2 text-base outline-none focus:border-accent"
          />
          <textarea
            value={editBio}
            onChange={(e) => setEditBio(e.target.value)}
            placeholder="О себе"
            maxLength={300}
            rows={3}
            className="w-full min-w-0 box-border resize-none rounded-card border border-lavender-200 bg-background px-3 py-2 text-base outline-none focus:border-accent"
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

      {!editing && profile.bio && <p className="mb-5 text-center text-base text-ink-900">{profile.bio}</p>}

      {/* Статистика */}
      <div className="mb-5 grid grid-cols-3 gap-2.5">
        <StatCard value={profile.eventsOrganizedCount} label="создано" icon={<PlusTile />} />
        <StatCard
          value={profile.eventsAttendedCount}
          label="посещено"
          icon={<Image src="/brand/3d/icon-users.png" alt="" width={26} height={26} />}
          tileClass="bg-lavender-100"
        />
        <StatCard
          value={profile.completedMeetingsCount}
          label="состоялось"
          icon={<HeartIcon />}
          tileClass="bg-pink-100"
        />
      </div>

      {/* Мои разделы */}
      <div className="rounded-[28px] bg-white/85 px-4 pb-1 pt-4 shadow-card backdrop-blur">
        <h2 className="mb-1 px-1 text-[13px] font-medium uppercase tracking-wide text-ink-400">Мои разделы</h2>
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
    <div className="relative min-w-0 rounded-[24px] bg-white/80 px-3 pb-3 pt-3.5 shadow-card backdrop-blur">
      <div
        className={`absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-[12px] ${tileClass}`}
        aria-hidden
      >
        {icon}
      </div>
      <div className="text-[26px] font-bold leading-8 text-ink-900">{value}</div>
      <div className="mt-2 truncate text-[13px] text-ink-600">{label}</div>
    </div>
  );
}

function PlusTile() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-[8px] bg-brand-gradient text-base font-bold leading-none text-white">
      +
    </span>
  );
}

function HeartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
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
    <Link href={href} className="flex items-center gap-3.5 active:opacity-70">
      <Image src={icon} alt="" width={48} height={48} className="shrink-0" />
      <div
        className={`flex min-w-0 flex-1 items-center gap-2 py-5 ${last ? "" : "border-b border-lavender-100"}`}
      >
        <span className="flex-1 truncate text-[17px] text-ink-900">{label}</span>
        {value && <span className="shrink-0 text-[15px] text-ink-400">{value}</span>}
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
