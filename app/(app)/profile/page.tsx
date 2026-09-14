"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { type Plan } from "@/lib/subscriptions/limits";

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
  events?: { used: number; limit: number | null };
  boosts?: { used: number; limit: number };
}

const PLAN_TITLES: Record<Plan, string> = { start: "Старт", medium: "Медиум", premium: "Премьер" };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/me/profile").then((r) => r.json()),
      fetch("/api/subscriptions").then((r) => r.json()),
    ])
      .then(([profileData, subData]) => {
        if (!profileData.error) setProfile(profileData);
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
    e.target.value = ""; // чтобы повторный выбор того же файла тоже сработал
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

  return (
    <div className="px-5 py-6">
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white text-2xl font-semibold text-ink-600 shadow-card">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt={profile.name} className="h-full w-full object-cover" />
            ) : (
              profile.name.charAt(0).toUpperCase()
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm text-white shadow-card active:scale-95"
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
        <div className="min-w-0">
          <h1 className="text-display truncate">
            {profile.name}, {profile.age}
          </h1>
          <p className="text-sm text-ink-600">{profile.city}</p>
        </div>
        </div>

        <Link href="/settings" aria-label="Настройки" className="mt-1 shrink-0">
          <Image src="/brand/icons/settings.svg" alt="" width={22} height={22} />
        </Link>
      </div>

      {uploadError && <p className="mb-4 text-center text-sm text-red-600">{uploadError}</p>}

      {profile.bio && <p className="mb-6 text-sm text-ink-900">{profile.bio}</p>}

      <div className="mb-6 grid grid-cols-3 gap-2">
        <StatCard
          label="Рейтинг"
          value={profile.ratingCount > 0 ? profile.ratingAvg.toFixed(1) : "—"}
          emoji="⭐"
        />
        <StatCard label="Встреч состоялось" value={String(profile.completedMeetingsCount)} emoji="🤝" />
        <StatCard label="Создано встреч" value={String(profile.eventsOrganizedCount)} emoji="📋" />
      </div>

      <h2 className="text-title mb-3">Мой пакет</h2>
      {subscription?.active ? (
        <Link
          href="/subscriptions"
          className="mb-6 flex items-center justify-between rounded-card-lg bg-ink-900 p-5 text-white shadow-card-lg"
        >
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-16 shrink-0">
              <Image src="/brand/3d/subscription-coins.png" alt="" fill className="object-contain" sizes="64px" />
            </div>
            <div>
              <span className="text-lg font-bold">{PLAN_TITLES[subscription.plan!]}</span>
              <p className="text-sm text-white/70">
                до {new Date(subscription.periodEnd!).toLocaleDateString("ru-RU")}
              </p>
            </div>
          </div>
          <span className="text-white/70">→</span>
        </Link>
      ) : (
        <Link
          href="/subscriptions"
          className="mb-6 flex items-center gap-3 rounded-card-lg bg-white p-5 shadow-card-lg"
        >
          <div className="relative h-12 w-16 shrink-0">
            <Image src="/brand/3d/subscription-coins.png" alt="" fill className="object-contain" sizes="64px" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-900">Оформить подписку</p>
            <p className="text-xs text-ink-600">Нужна для создания встреч</p>
          </div>
          <span className="ml-auto text-accent">→</span>
        </Link>
      )}

      <Link
        href="/reviews"
        className="flex items-center justify-between rounded-card bg-white p-4 shadow-card"
      >
        <span className="text-sm font-medium text-ink-900">Отзывы после встреч</span>
        <span className="text-accent">→</span>
      </Link>
    </div>
  );
}

function StatCard({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="rounded-card bg-white p-3 text-center shadow-card">
      <div className="text-lg">{emoji}</div>
      <div className="text-lg font-bold text-ink-900">{value}</div>
      <div className="text-[11px] leading-tight text-ink-600">{label}</div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
