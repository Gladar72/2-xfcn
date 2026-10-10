"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/brand/Icon";
import Link from "next/link";
import Image from "next/image";
import { type Plan } from "@/lib/subscriptions/limits";
import { AvatarViewer } from "@/components/profile/AvatarViewer";
import { resizeImageFile } from "@/lib/photos/resize-image-client";
import { useVisualViewportHeight } from "@/lib/hooks/use-visual-viewport-height";
import { RatingStar } from "@/components/ui/RatingStar";
import { photoThumb } from "@/lib/photos/thumb";
import { useGuide } from "@/lib/mosya/guide";


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
  useGuide("profile", { when: profile !== null });
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
      className="relative flex flex-col gap-3 overflow-y-auto px-4 pb-3 pt-3 [@media(max-height:680px)]:gap-2"
      style={{
        height: viewportHeight && !editing ? `${viewportHeight - navHeight}px` : `calc(100dvh - ${navHeight}px)`,
      }}
    >
      {/* Заголовок экрана и настройки */}
      <div className="flex shrink-0 items-center justify-between pt-1">
        <h1 className="m-title text-ink-900">Профиль</h1>
        <Link
          href="/settings"
          aria-label="Настройки"
          className="m-glass m-press flex h-11 w-11 items-center justify-center rounded-full"
        >
          <Icon name="gear" size={22} />
        </Link>
      </div>

      {/* Карточка профиля: фото слева, имя/город/рейтинг/о себе, маскот справа */}
      <div className="relative shrink-0 overflow-hidden rounded-[28px] m-glass px-4 py-5 [@media(max-height:680px)]:py-3.5">
        <Image
          src="/brand/mosya/mosya_sit.webp"
          alt=""
          width={120}
          height={115}
          unoptimized
          aria-hidden
          className="pointer-events-none absolute -bottom-3 -right-2 h-[110px] w-auto object-contain [@media(max-height:680px)]:h-[84px]"
        />
        <div className="relative flex items-center gap-4 pr-16">
          <div className="shrink-0">
            {profile.avatarUrl ? (
              <AvatarViewer src={profile.avatarUrl} alt={profile.name}>
                <div className="h-[104px] w-[104px] overflow-hidden rounded-full bg-lavender-100 shadow-[0_0_0_3px_#fff,0_0_0_6px_rgba(162,77,255,.55)] [@media(max-height:680px)]:h-[80px] [@media(max-height:680px)]:w-[80px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoThumb(profile.avatarUrl, 128)} alt={profile.name} className="h-full w-full object-cover" />
                </div>
              </AvatarViewer>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                aria-label="Добавить фото"
                className="flex h-[104px] w-[104px] items-center justify-center rounded-full bg-brand-gradient text-3xl font-semibold text-white [@media(max-height:680px)]:h-[80px] [@media(max-height:680px)]:w-[80px]"
              >
                {profile.name.charAt(0).toUpperCase()}
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelected} />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[22px] font-medium tracking-tight text-ink-900">
              {profile.name}, {profile.age}
            </h2>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-600">
              <Icon name="pin" size={18} className="shrink-0 text-accent" />
              <span className="truncate">{profile.city}</span>
            </p>
            {profile.ratingCount > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-600">
                <RatingStar size={18} />
                {profile.ratingAvg.toFixed(1).replace(".", ",")} · {profile.ratingCount}{" "}
                {pluralize(profile.ratingCount, "оценка", "оценки", "оценок")}
              </p>
            )}
            {profile.bio && (
              <p className="mt-2 line-clamp-2 text-sm leading-snug text-ink-900 [@media(max-height:680px)]:line-clamp-1">
                {profile.bio}
              </p>
            )}
            {uploadingPhoto && <p className="mt-1 text-xs text-ink-400">Загружаем фото…</p>}
            {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}
          </div>
        </div>
      </div>

      <button
        onClick={() => setEditing(true)}
        className="m-glass m-press flex shrink-0 items-center justify-center gap-2 rounded-[22px] py-4 text-base font-medium text-accent [@media(max-height:680px)]:py-3"
      >
        <Icon name="edit" size={18} />
        Редактировать профиль
      </button>

      {/* Статистика */}
      <div className="grid shrink-0 grid-cols-3 gap-2.5">
        <StatCard value={profile.eventsOrganizedCount} label="создано" icon={<PlusTile />} />
        <StatCard
          value={profile.eventsAttendedCount}
          label="посещено"
          icon={<Icon name="people" size={22} className="text-accent" />}
        />
        <StatCard
          value={profile.completedMeetingsCount}
          label="состоялось"
          icon={<HeartIcon />}
          tileClass="bg-pink-100"
        />
      </div>

      {/* Мои разделы */}
      <div className="shrink-0 rounded-[28px] m-glass px-4 py-1">
        <MenuRow href="/my-events" icon="cal" label="Мои встречи" />
        <MenuRow href="/notifications" icon="bell" label="Уведомления" />
        <MenuRow
          href="/subscriptions"
          icon="gift"
          label="Подписка"
          value={subscription?.active ? PLAN_TITLES[subscription.plan!] : "не оформлена"}
          badge={!!subscription?.active}
        />
        <MenuRow href="/reviews" icon="star" label="Отзывы после встреч" last />
      </div>

      {/* Мося-помощник: вопрос в поддержку (ИИ отвечает сразу в боте) */}
      <Link
        href="/support"
        className="m-press fixed bottom-[96px] right-4 z-30 flex items-center gap-2 rounded-pill bg-white/85 py-1.5 pl-1.5 pr-4 text-[13.5px] font-medium shadow-card-lg backdrop-blur-xl"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mosya/mosya_glasses.webp" alt="" className="h-10 w-10 object-contain" />
        Задать вопрос
      </Link>

      {/* Редактирование — модальное окно поверх, чтобы не раздувать экран */}
      {editing && (
        <div
          className="m-fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 px-4 backdrop-blur-sm"
          onClick={() => !savingEdit && setEditing(false)}
        >
          <div
            className="m-pop w-full max-w-sm space-y-2.5 rounded-[28px] bg-white/95 p-4 shadow-card-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="pb-1 text-center text-title text-ink-900">Редактировать профиль</h2>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="flex w-full items-center justify-center gap-2 rounded-card bg-lavender-50 py-2.5 text-sm font-medium text-accent disabled:opacity-60"
            >
              <Icon name="camera" size={20} className="text-accent" />
              {uploadingPhoto ? "Загружаем фото…" : "Изменить фото"}
            </button>
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
                className="flex-1 rounded-pill bg-brand-gradient py-2.5 text-sm font-semibold text-white disabled:opacity-50 m-btn-v relative overflow-hidden"
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
    <div className="relative min-w-0 rounded-[22px] m-glass px-3 py-3 [@media(max-height:680px)]:py-2">
      <div
        className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-[10px] ${tileClass}`}
        aria-hidden
      >
        {icon}
      </div>
      <div className="text-2xl font-medium leading-7 tracking-tight text-ink-900">{value}</div>
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
  badge = false,
  last = false,
}: {
  href: string;
  icon: IconName;
  label: string;
  value?: string;
  /** Показать значение плашкой (как тариф подписки), а не серым текстом. */
  badge?: boolean;
  last?: boolean;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 active:opacity-70">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[rgba(108,59,255,.1)] text-accent [@media(max-height:680px)]:h-9 [@media(max-height:680px)]:w-9">
        <Icon name={icon} size={21} />
      </span>
      <div
        className={`flex min-w-0 flex-1 items-center gap-2 py-3.5 [@media(max-height:680px)]:py-2.5 ${last ? "" : "border-b border-lavender-100"}`}
      >
        <span className="flex-1 truncate text-base text-ink-900">{label}</span>
        {value &&
          (badge ? (
            <span className="shrink-0 rounded-full bg-lavender-100 px-4 py-1.5 text-sm font-semibold text-accent">{value}</span>
          ) : (
            <span className="shrink-0 text-sm text-ink-400">{value}</span>
          ))}
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
