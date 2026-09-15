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
