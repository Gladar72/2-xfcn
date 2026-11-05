"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type Plan } from "@/lib/subscriptions/limits";
import { photoThumb } from "@/lib/photos/thumb";
import { useGuide } from "@/lib/mosya/guide";
import { mosyaSrc } from "@/components/brand/Mosya";
import { Ic, Overlay, Screen, Toast } from "@/components/proto/ui";
import { useProfilePhoto } from "@/components/profile/useProfilePhoto";
import { SupportSheet } from "@/components/proto/SupportSheet";
import { HeartsSheet } from "@/components/people/HeartsSheet";
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
  const [toast, setToast] = useState<string | null>(null);
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

  const MENU: [IconName, string, string][] = [
    ["cal", "Мои встречи", "/my-events"],
    ["bell", "Уведомления", "/notifications"],
    ["star", "Отзывы после встреч", "/reviews"],
    ["gift", "Партнёрская программа", "https://t.me/Mesto_people_bot?start=partner"],
    ["lock", "Приватность и анонимность", "/settings/privacy"],
  ];

  const main = profile?.avatarUrl ?? photos[0] ?? null;
  // «Мои фото»: главное + дополнительные, всего до 6; показываем по 3 в ряд и ячейку «Добавить».
  const all = [main, ...photos.filter((u) => u !== main)].filter((u): u is string => !!u).slice(0, 6);
  const photo = useProfilePhoto({
    onDone: (r) => {
      if (!profile) return;
      if (r.main) setProfile({ ...profile, avatarUrl: r.avatarUrl, photos: [r.avatarUrl, ...photos.slice(1)] });
      else setProfile({ ...profile, photos: r.photos });
    },
    onError: (t) => {
      setToast(t);
      setTimeout(() => setToast(null), 2600);
    },
  });

  return (
    <Screen id="profile" className="me2" scrollClass="me2s">
      {/* Фон экрана — то же фото, размытое и затемнённое. */}
      <div className="mebg" aria-hidden style={main ? { backgroundImage: `url(${photoThumb(main, 240)})` } : undefined} />
      <div className="mehero">
        {main ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="meph" src={photoThumb(main, 300, true)} alt="" fetchPriority="high" />
        ) : (
          <span className="meph none">{(profile?.name ?? "?").charAt(0).toUpperCase()}</span>
        )}
        <div className="metop">
          <h1 className="t">Профиль</h1>
          <Link className="rb glass" href="/settings" aria-label="Настройки">
            <Ic n="gear" />
          </Link>
        </div>
        {profile && (
          <div className="mehc">
            <h2>
              {profile.name}
              {profile.age ? `, ${profile.age}` : ""}
            </h2>
            <div className="mepills">
              {profile.city && <span>{profile.city}</span>}
              {profile.ratingAvg > 0 && (
                <span>{`★ ${profile.ratingAvg.toFixed(1).replace(".", ",")} · ${profile.ratingCount} ${plural(profile.ratingCount, "оценка", "оценки", "оценок")}`}</span>
              )}
            </div>
          </div>
        )}
      </div>

      <HeartsSheet />

      {!profile ? (
        <div className="sk" style={{ height: 220, borderRadius: 24 }} />
      ) : (
        <div className="mebody">
          <div className="meg meacts">
            <Link href={`/people/${profile.id}`}>
              <Ic n="eye" />
              Как меня видят
            </Link>
            <i />
            <Link href="/profile/edit">
              <Ic n="edit" />
              Редактировать
            </Link>
          </div>

          <div className="meg mephotos">
            <div className="mer">
              <b>Мои фото</b>
              <span>{all.length} из 6</span>
            </div>
            <div className="megrid">
              {all.map((u, k) =>
                k === 0 ? (
                  <button key={u} type="button" onClick={() => photo.pick(0)} aria-label="Заменить главное фото">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoThumb(u, 384)} alt="" />
                    <small>главное</small>
                    {photo.busySlot === 0 && <span className="mebusy" />}
                  </button>
                ) : (
                  // Дополнительные фото меняются и удаляются в редактировании профиля.
                  <Link key={u} href="/profile/edit" aria-label="Фото — изменить в редактировании">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoThumb(u, 384)} alt="" />
                  </Link>
                )
              )}
              {all.length < 6 && (
                <button type="button" className="add" onClick={() => photo.pick(all.length === 0 ? 0 : 1)}>
                  {photo.busySlot !== null && photo.busySlot !== 0 ? <span className="mebusy" /> : <Ic n="plus" />}
                  <span>Добавить</span>
                </button>
              )}
            </div>
          </div>
          {photo.ui}

          <div className="meg meline">
            {(["создано", "посещено", "состоялось"] as const).map((l, k) => (
              <span key={l}>
                <b>{counts[k]}</b>
                {l}
              </span>
            ))}
          </div>

          <Link className="meg mesub" href="/subscriptions">
            <span className="mesb">
              <Ic n="star" />
            </span>
            <div>
              <b>{sub?.active && sub.plan ? `Подписка «${PLAN_TITLES[sub.plan]}»` : "Нет подписки"}</b>
              <span>
                {sub?.active && sub.periodEnd
                  ? `активна до ${new Date(sub.periodEnd).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`
                  : "подключи, чтобы создавать свои встречи"}
              </span>
            </div>
            <Ic n="chev" c="s" />
          </Link>

          <div className="meg memenu">
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
        </div>
      )}
      <Toast text={toast} />

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
