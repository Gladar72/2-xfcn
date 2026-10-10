"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type Plan } from "@/lib/subscriptions/limits";
import { photoThumb } from "@/lib/photos/thumb";
import { useGuide } from "@/lib/mosya/guide";
import { mosyaSrc } from "@/components/brand/Mosya";
import { Ic, Overlay, Screen } from "@/components/proto/ui";
import { SupportSheet } from "@/components/proto/SupportSheet";
import type { IconName } from "@/components/brand/Icon";

interface Profile {
  id: string;
  name: string;
  avatarUrl: string | null;
  photos?: string[];
  interests?: { id: string; name: string }[];
  age: number;
  city: string;
  bio: string | null;
  ratingAvg: number;
  ratingCount: number;
  completedMeetingsCount: number;
  eventsOrganizedCount: number;
  eventsAttendedCount: number;
}
interface SubscriptionStatus {
  active: boolean;
  plan?: Plan;
  periodEnd?: string;
  events?: { used: number; limit: number | null };
}

const PLAN_TITLES: Record<Plan, string> = { start: "Старт", medium: "Медиум", premium: "Премьер" };

/** Профиль (SCR.profile прототипа). */
export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [supOpen, setSupOpen] = useState(false);
  const [counts, setCounts] = useState([0, 0, 0]);
  useGuide("profile", { when: profile !== null });

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((d) => !d.error && setProfile(d))
      .catch(() => {});
    fetch("/api/subscriptions")
      .then((r) => r.json())
      .then(setSub)
      .catch(() => {});
  }, []);

  // Счётчики «докручиваются» от нуля, как в прототипе.
  useEffect(() => {
    if (!profile) return;
    const target = [profile.eventsOrganizedCount, profile.eventsAttendedCount, profile.completedMeetingsCount];
    const st = performance.now();
    let raf = 0;
    const f = (now: number) => {
      const k = Math.min(1, (now - st) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      setCounts(target.map((t) => Math.round(t * e)));
      if (k < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [profile]);

  const photos = profile?.photos ?? [];
  const compl = profile
    ? Math.min(100, 30 + Math.min(photos.length, 3) * 15 + (profile.bio ? 10 : 0) + ((profile.interests?.length ?? 0) >= 3 ? 15 : 0))
    : 0;
  const complHint = compl >= 100 ? "отлично!" : photos.length < 3 ? `добавь ещё ${3 - photos.length} фото` : !profile?.bio ? "добавь о себе" : "добавь интересы";

  const MENU: [IconName, string, string][] = [
    ["cal", "Мои встречи", "/my-events"],
    ["bell", "Уведомления", "/notifications"],
    ["star", "Отзывы после встреч", "/reviews"],
    ["gift", "Партнёрская программа", "https://t.me/Mesto_people_bot?start=partner"],
    ["lock", "Приватность и анонимность", "/settings/privacy"],
    ["gear", "Настройки", "/settings"],
  ];

  return (
    <Screen id="profile">
      <div className="top">
        <h1 className="t">Профиль</h1>
        <Link className="rb gl" href="/settings" aria-label="Настройки">
          <Ic n="gear" />
        </Link>
      </div>

      {!profile ? (
        <div className="sk" style={{ height: 330, marginTop: 10, borderRadius: 30 }} />
      ) : (
        <div className="me-card gl">
          <div className="pava">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoThumb(profile.avatarUrl, 200)} alt="" />
            ) : (
              profile.name.charAt(0).toUpperCase()
            )}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="bud" src={mosyaSrc("sit")} alt="" />
          <h2 className="t">
            {profile.name}
            {profile.age ? `, ${profile.age}` : ""}
          </h2>
          <span className="meta">
            {profile.city}
            {profile.ratingAvg > 0 ? ` · ★ ${profile.ratingAvg.toFixed(1).replace(".", ",")} · ${profile.ratingCount} ${plural(profile.ratingCount, "оценка", "оценки", "оценок")}` : ""}
          </span>
          <div className="compl">
            <div>
              <b>Профиль заполнен на {compl}%</b>
              <span className="muted">{complHint}</span>
            </div>
            <span className="bar2">
              <i style={{ width: `${compl}%` }} />
            </span>
          </div>
          <div className="twob">
            <Link className="btn o" href={`/people/${profile.id}`}>
              <Ic n="eye" c="s" />
              Как меня видят
            </Link>
            <Link className="btn v" href="/profile/edit">
              <Ic n="edit" c="s" />
              Редактировать
            </Link>
          </div>
        </div>
      )}

      <div className="stats">
        {(
          [
            ["party", "создано"],
            ["concert", "посещено"],
            ["lang", "состоялось"],
          ] as const
        ).map(([i, l], k) => (
          <div key={i} className="gl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/brand/cat3d/i_${i}.webp`} alt="" />
            <b>{counts[k]}</b>
            <span>{l}</span>
          </div>
        ))}
      </div>

      <Link className="subc" href="/subscriptions">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mosyaSrc("jump")} alt="" />
        <small>Подписка</small>
        <b>{sub?.active && sub.plan ? `«${PLAN_TITLES[sub.plan]}»` : "Нет подписки"}</b>
        <span>
          {sub?.active && sub.periodEnd
            ? `Активна до ${new Date(sub.periodEnd).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}${
                sub.events && sub.events.limit != null ? ` · ${sub.events.used} из ${sub.events.limit} встреч` : ""
              }`
            : "Подключи, чтобы создавать свои встречи"}
        </span>
      </Link>

      <div className="menu gl">
        {MENU.map(([i, t, href]) =>
          href.startsWith("http") ? (
            <a key={t} href={href} target="_blank" rel="noreferrer">
              <Ic n={i} />
              <span>{t}</span>
              <Ic n="chev" c="s cv" />
            </a>
          ) : (
            <Link key={t} href={href}>
              <Ic n={i} />
              <span>{t}</span>
              <Ic n="chev" c="s cv" />
            </Link>
          )
        )}
      </div>

      <Overlay>
        <button className="supfab" onClick={() => setSupOpen(true)} aria-label="Задать вопрос">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mosyaSrc("glasses")} alt="" />
          <span>Задать вопрос</span>
        </button>
      </Overlay>
      <SupportSheet open={supOpen} onClose={() => setSupOpen(false)} />
    </Screen>
  );
}

function plural(n: number, a: string, b: string, c: string) {
  const m = n % 10;
  const h = n % 100;
  return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c;
}
