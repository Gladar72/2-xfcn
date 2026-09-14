"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
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

const PLAN_TITLES: Record<Plan, string> = { start: "START", medium: "MEDIUM", premium: "PREMIUM" };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="px-5 py-6">
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-2xl font-semibold text-ink-600 shadow-card">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatarUrl} alt={profile.name} className="h-full w-full object-cover" />
          ) : (
            profile.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-display truncate">
            {profile.name}, {profile.age}
          </h1>
          <p className="text-sm text-ink-600">{profile.city}</p>
        </div>
      </div>

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
        <div className="mb-6 rounded-card bg-ink-900 p-5 text-white shadow-card">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-lg font-bold">{PLAN_TITLES[subscription.plan!]}</span>
            <span className="text-sm text-white/70">
              до {new Date(subscription.periodEnd!).toLocaleDateString("ru-RU")}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <UsageRow
              label="Встречи"
              used={subscription.events!.used}
              limit={subscription.events!.limit}
            />
            <UsageRow label="Поднятия" used={subscription.boosts!.used} limit={subscription.boosts!.limit} />
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-card bg-white p-5 text-center shadow-card">
          <p className="mb-3 text-sm text-ink-600">Подписки пока нет — она нужна для создания встреч.</p>
          <Link href="/create">
            <Button className="w-auto px-6">Оформить подписку</Button>
          </Link>
        </div>
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

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const isUnlimited = limit === null;
  const ratio = isUnlimited ? 0 : Math.min(1, used / Math.max(1, limit));

  return (
    <div>
      <div className="mb-1 flex justify-between text-white/90">
        <span>{label}</span>
        <span>{isUnlimited ? `${used} · без ограничений` : `${used} / ${limit}`}</span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 overflow-hidden rounded-pill bg-white/20">
          <div className="h-full rounded-pill bg-accent" style={{ width: `${ratio * 100}%` }} />
        </div>
      )}
    </div>
  );
}
