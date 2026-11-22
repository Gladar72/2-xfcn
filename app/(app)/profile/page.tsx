"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PLAN_LIMITS, type Plan } from "@/lib/subscriptions/limits";
import { photoThumb } from "@/lib/photos/thumb";
import { useGuide } from "@/lib/mosya/guide";
import { Screen, Toast } from "@/components/proto/ui";
import { KI, bg } from "@/components/proto/k";
import { interestIcon } from "@/lib/data/interests";
import { IncomingHeartsLink } from "@/components/people/IncomingHeartsLink";
import { FollowsBlock } from "@/components/profile/FollowsBlock";
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
  boosts?: { used: number; limit: number | null };
}

const PLAN_TITLES: Record<Plan, string> = { start: "Старт", medium: "Медиум", premium: "Премьер" };

/** Профиль (SCR.profile прототипа). */
export default function ProfilePage({ searchParams }: { searchParams: { hearts?: string } }) {
  const router = useRouter();
  useEffect(() => { if (searchParams.hearts === "1") router.replace("/hearts"); }, [router, searchParams.hearts]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
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
    ["bell", "Уведомления", "/notifications"],
    ["star", "Отзывы после встреч", "/reviews"],
    ["gift", "Партнёрская программа", "/partner"],
    ["lock", "Приватность и анонимность", "/settings/privacy"],
  ];

  const main = profile?.avatarUrl ?? photos[0] ?? null;
  // «Мои фото»: главное + дополнительные, всего до 6; показываем по 3 в ряд и ячейку «Добавить».
  const all = [main, ...photos.filter((u) => u !== main)].filter((u): u is string => !!u).slice(0, 6);
  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(null), 2400);
  }
  async function shareProfile() {
    if (!profile) return;
    const link = `${window.location.origin}/people/${profile.id}`;
    try {
      await navigator.clipboard.writeText(link);
      flash("Ссылка на профиль скопирована");
    } catch {
      flash(link);
    }
  }
  const [first, ...rest] = (profile?.name ?? "").split(" ");
  const lim = sub?.events?.limit ?? null;
  const used = sub?.events?.used ?? 0;

  return (
    <Screen id="profile" className="k-pp" plain>
      <div className="k-hero2" aria-hidden style={main ? { backgroundImage: `url(${photoThumb(main, 900, true)})`, backgroundSize: "cover", backgroundPosition: "center 25%" } : { background: "linear-gradient(180deg,#D9D3E6,#F4F2F8)" }} />
      <div className="k-tbar">
        <button className="k-rb k-gw k-pr" onClick={shareProfile} aria-label="Поделиться профилем">
          <KI n="share" />
        </button>
        <Link className="k-rb k-gw k-pr" href="/settings" aria-label="Настройки">
          <KI n="more" />
        </Link>
      </div>
      <div className="scroll">
        <div className="k-spacer" />
        {!profile ? (
          <div className="k-sk" style={{ height: 220, borderRadius: 24 }} />
        ) : (
          <>
            <h1 className="k-nm">
              {first}
              {rest.length ? <> <em>{rest.join(" ")}</em></> : profile.age ? <>, <em>{profile.age}</em></> : null}
            </h1>
            <div className="k-mt3">
              {[profile.city, profile.ratingAvg > 0 ? `${profile.ratingAvg.toFixed(1).replace(".", ",")} ★` : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {(profile.interests ?? []).length > 0 && (
              <div className="k-tags">
                {(profile.interests ?? []).slice(0, 6).map((i) => (
                  <Link key={i.id} className="k-chip k-pr k-g" href="/profile/interests">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={interestIcon(i.name)} alt="" style={{ width: 22, height: 22, marginLeft: -4 }} />
                    {i.name}
                  </Link>
                ))}
              </div>
            )}

            <Link className="k-plan k-g k-pr" href="/subscriptions">
              <span className="k-pt">
                <small>Твой тариф</small>
                <b>
                  {sub?.active && sub.plan ? PLAN_TITLES[sub.plan] : "Без тарифа"}{" "}
                  {sub?.active && sub.plan && <span>{PLAN_LIMITS[sub.plan].priceRub} ₽/мес</span>}
                </b>
              </span>
              <span className="k-pc">{sub?.active ? "Сменить" : "Выбрать"}</span>
              <span className="k-pu">
                <span>
                  <i style={{ width: `${sub?.active ? (lim ? Math.min(100, Math.round((used / lim) * 100)) : 100) : 0}%` }} />
                </span>
                <small>
                  {sub?.active
                    ? `Встречи ${used} из ${lim ?? "∞"}${sub.boosts ? ` · топ ${sub.boosts.used} из ${sub.boosts.limit ?? "∞"}` : ""}${sub.periodEnd ? ` · до ${new Date(sub.periodEnd).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}` : ""}`
                    : "Подключи, чтобы создавать свои встречи"}
                </small>
              </span>
            </Link>

            <div className="k-acts">
              <Link className="k-btn k-l k-pr" href="/profile/edit">
                Редактировать профиль
              </Link>
            </div>

            <IncomingHeartsLink />
            <FollowsBlock />

            <div className="k-sec">
              <div>
                <h3>
                  Мои <em>фото</em>
                </h3>
              </div>
              <Link className="k-all k-g k-pr" href="/profile/edit">
                Изменить
              </Link>
            </div>
            <div className="k-ph3">
              {all.map(u => (
                <Link key={u} href="/profile/edit" aria-label="Изменить фото" className="k-pr">
                  <i style={bg(u, 400)} />
                </Link>
              ))}
              {all.length < 6 && (
                <Link href="/profile/edit" className="k-pr" aria-label="Добавить фото"><i className="k-g">+</i></Link>
              )}
            </div>

            <div className="k-sec">
              <div>
                <h3>
                  Мои <em>встречи</em>
                </h3>
                <p>
                  {counts[0]} создано · {counts[1]} посещено · {counts[2]} состоялось
                </p>
              </div>
              <Link className="k-all k-g k-pr" href="/my-events">
                Все
              </Link>
            </div>
            <div className="k-list">
              {MENU.map(([, t, href]) =>
                href.startsWith("http") ? (
                  <a key={t} className="k-row k-g k-pr" href={href} target="_blank" rel="noreferrer">
                    <span>{t}</span>
                    <KI n="chev" />
                  </a>
                ) : (
                  <Link key={t} className="k-row k-g k-pr" href={href}>
                    <span>{t}</span>
                    <KI n="chev" />
                  </Link>
                )
              )}
              <Link className="k-row k-g k-pr" href={`/people/${profile.id}`}>
                <span>Как меня видят другие</span>
                <KI n="chev" />
              </Link>
            </div>
            <div style={{ height: 30 }} />
          </>
        )}
      </div>
      <Toast text={toast} />

    </Screen>
  );
}
