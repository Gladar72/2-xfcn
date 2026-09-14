mkdir -p "."
cat > "tailwind.config.ts" << 'ENDOFFILE'
import type { Config } from "tailwindcss";

/**
 * Дизайн-токены МЕСТО (ребрендинг, см. MESTO_FINAL_assets).
 *
 * ВАЖНО: имена токенов (accent, ink, background, card, pill...) оставлены
 * ТЕМИ ЖЕ, что были раньше — меняются только значения. Это значит весь
 * редизайн применяется автоматически по всему приложению без необходимости
 * переписывать className в каждом компоненте. Новые токены (lavender,
 * orange, brand-gradient, shadow.cta/soft) добавлены для новых элементов.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-onest)", "Manrope", "system-ui", "sans-serif"],
      },
      colors: {
        // Основной фирменный цвет — purple (был оранжевый accent).
        accent: {
          DEFAULT: "#6C3BFF",
          50: "#F3EEFF",
          100: "#EDE5FF",
          500: "#6C3BFF",
          600: "#5C2FE0",
          700: "#4B25B8",
        },
        // Второй фирменный цвет — orange, используется в градиенте и как тёплый акцент.
        orange: {
          DEFAULT: "#FF8A2A",
          400: "#FF9A3D",
          500: "#FF8A2A",
          600: "#FFA94D",
        },
        // Lavender — светлые "фирменные" подложки (selected state, карточки).
        lavender: {
          50: "#F3EEFF",
          100: "#EDE5FF",
          200: "#E5D9FF",
        },
        surface: "#FFFFFF",
        // Основной фон — белый; background используется там, где нужен лёгкий lavender-оттенок.
        background: "#FCFAFF",
        ink: {
          900: "#111111",
          600: "#686868",
          400: "#8B8B8B",
        },
      },
      backgroundImage: {
        // Основной фирменный градиент МЕСТО — для CTA, selected states, "Своё предложение".
        "brand-gradient": "linear-gradient(135deg, #6C3BFF 0%, #8A5CFF 45%, #FF8A2A 100%)",
      },
      borderRadius: {
        card: "24px",
        "card-lg": "32px",
        "card-sm": "18px",
        pill: "999px",
        sheet: "32px",
      },
      fontSize: {
        display: ["28px", { lineHeight: "34px", fontWeight: "800" }],
        title: ["20px", { lineHeight: "26px", fontWeight: "700" }],
      },
      boxShadow: {
        card: "0 6px 20px rgba(110, 70, 180, 0.08)",
        "card-lg": "0 8px 30px rgba(90, 65, 150, 0.10)",
        cta: "0 10px 28px rgba(108, 59, 255, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
ENDOFFILE

mkdir -p "app"
cat > "app/layout.tsx" << 'ENDOFFILE'
import type { Metadata } from "next";
import Script from "next/script";
import { Onest } from "next/font/google";
import "./globals.css";

// Onest — основной фирменный шрифт МЕСТО (см. MESTO_FINAL_assets/README_FINAL.md).
// Подключаем штатным способом через next/font — без коммита файлов шрифта.
// Кириллица обязательна: весь интерфейс на русском.
const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-onest",
  display: "swap",
});

export const metadata: Metadata = {
  title: "МЕСТО",
  description: "Когда есть куда пойти, но не с кем.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={onest.variable}>
      <head>
        {/* Официальный скрипт Telegram Mini Apps — инжектит window.Telegram.WebApp */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="bg-background text-ink-900 antialiased font-sans">{children}</body>
    </html>
  );
}
ENDOFFILE

mkdir -p "app/(app)/feed"
cat > "app/(app)/feed/page.tsx" << 'ENDOFFILE'
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { TrainingTypeSheet } from "@/components/home/TrainingTypeSheet";
import { EventCard, type EventCardData } from "@/components/feed/EventCard";
import { Button } from "@/components/ui/Button";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

interface TrainingType {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

export default function FeedPage() {
  return (
    // useSearchParams требует Suspense-границу в Next.js App Router
    <Suspense>
      <FeedPageContent />
    </Suspense>
  );
}

function FeedPageContent() {
  const searchParams = useSearchParams();
  const categoryFilter = searchParams.get("category");
  const typeFilter = searchParams.get("type");

  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [events, setEvents] = useState<EventCardData[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appliedEventIds, setAppliedEventIds] = useState<Set<string>>(new Set());
  const [applyingEventId, setApplyingEventId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((data) => setAvatarUrl(data.avatarUrl ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories ?? []);
        setTrainingTypes(data.trainingTypes ?? []);
      })
      .catch(() => {
        setCategories([]);
        setTrainingTypes([]);
      });
  }, []);

  useEffect(() => {
    setEvents([]);
    setPage(0);
    loadPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, typeFilter]);

  async function loadPage(pageToLoad: number, replace: boolean) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pageToLoad) });
      if (categoryFilter) params.set("category", categoryFilter);
      if (typeFilter) params.set("type", typeFilter);

      const res = await fetch(`/api/events?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error === "city_required" ? "Сначала заверши регистрацию." : "Не удалось загрузить ленту.");
        return;
      }

      setEvents((prev) => (replace ? data.items : [...prev, ...data.items]));
      setHasMore(Boolean(data.hasMore));
      setPage(pageToLoad);
    } catch {
      setError("Проблема с соединением.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(eventId: string) {
    if (appliedEventIds.has(eventId) || applyingEventId) return;
    setApplyingEventId(eventId);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();

      if (res.ok) {
        setAppliedEventIds((prev) => new Set(prev).add(eventId));
        setToast("Отклик отправлен! Организатор скоро ответит.");
      } else if (data.error === "already_applied") {
        setAppliedEventIds((prev) => new Set(prev).add(eventId));
        setToast("Ты уже откликался на эту встречу.");
      } else if (data.error === "event_full") {
        setToast("Мест уже не осталось.");
      } else if (data.error === "cannot_apply_to_own_event") {
        setToast("Это твоя встреча — не нужно откликаться на неё самому.");
      } else {
        setToast("Не получилось отправить отклик.");
      }
    } catch {
      setToast("Проблема с соединением.");
    } finally {
      setApplyingEventId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <div>
      <TopBar city="Тюмень" avatarUrl={avatarUrl} />

      <div className="px-5 pb-2 pt-6">
        <h1 className="text-display">
          Что хочешь сделать <span className="text-accent">сегодня?</span>
        </h1>
      </div>

      <CategoryGrid categories={categories} onTrainingPress={() => setSheetOpen(true)} />

      <div className="mt-4 px-5">
        <Link href="/create">
          <Button>Создать встречу</Button>
        </Link>
      </div>

      <div className="mt-8 space-y-3 px-5">
        <h2 className="text-title">Интересные встречи рядом</h2>

        {loading && events.length === 0 && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-card bg-white shadow-card" />
            ))}
          </div>
        )}

        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {!loading && !error && events.length === 0 && (
          <div className="rounded-card bg-white p-6 text-center text-sm text-ink-600 shadow-card">
            Сегодня пока тихо. Создайте первый план в своём городе.
          </div>
        )}

        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            applied={appliedEventIds.has(event.id)}
            applying={applyingEventId === event.id}
            onApplyPress={handleApply}
          />
        ))}

        {hasMore && (
          <Button variant="secondary" onClick={() => loadPage(page + 1, false)} disabled={loading}>
            {loading ? "Загружаем..." : "Показать ещё"}
          </Button>
        )}
      </div>

      <TrainingTypeSheet
        open={sheetOpen}
        trainingTypes={trainingTypes}
        onClose={() => setSheetOpen(false)}
      />

      {toast && (
        <div className="fixed inset-x-5 bottom-24 z-50 rounded-card bg-ink-900 px-4 py-3 text-center text-sm text-white shadow-card">
          {toast}
        </div>
      )}
    </div>
  );
}
ENDOFFILE

mkdir -p "app/(app)/profile"
cat > "app/(app)/profile/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useRef, useState } from "react";
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
      <div className="mb-6 flex items-center gap-4">
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
          <div>
            <span className="text-lg font-bold">{PLAN_TITLES[subscription.plan!]}</span>
            <p className="text-sm text-white/70">
              до {new Date(subscription.periodEnd!).toLocaleDateString("ru-RU")}
            </p>
          </div>
          <span className="text-white/70">→</span>
        </Link>
      ) : (
        <div className="mb-6 rounded-card bg-white p-5 text-center shadow-card">
          <p className="mb-3 text-sm text-ink-600">Подписки пока нет — она нужна для создания встреч.</p>
          <Link href="/subscriptions">
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
ENDOFFILE

mkdir -p "app/(app)/subscriptions"
cat > "app/(app)/subscriptions/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Paywall } from "@/components/paywall/Paywall";
import { type Plan } from "@/lib/subscriptions/limits";

interface SubscriptionStatus {
  active: boolean;
  plan?: Plan;
  periodEnd?: string;
  events?: { used: number; limit: number | null };
  boosts?: { used: number; limit: number };
}

const PLAN_TITLES: Record<Plan, string> = { start: "Старт", medium: "Медиум", premium: "Премьер" };
const PLAN_ICON: Record<Plan, string> = {
  start: "/brand/subscription/plan-start-rocket.png",
  medium: "/brand/subscription/plan-medium-crown.png",
  premium: "/brand/subscription/plan-premier-diamond.png",
};

/**
 * Экран, на который ведут две 3D-монеты в нижней навигации (см. бриф п.18-20).
 * Если подписки нет — показываем выбор тарифа (Paywall).
 * Если подписка есть — показываем "Мой тариф" со статистикой использования
 * и возможностью сменить тариф.
 */
export default function SubscriptionsPage() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [changingPlan, setChangingPlan] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/subscriptions")
      .then((r) => r.json())
      .then(setStatus)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <p className="text-ink-600">Загрузка...</p>
      </div>
    );
  }

  if (!status?.active || changingPlan) {
    return <Paywall onActivated={() => { setChangingPlan(false); load(); }} />;
  }

  const plan = status.plan!;

  return (
    <div className="px-5 py-6">
      <h1 className="text-display mb-6 text-center">Мой тариф</h1>

      <div className="relative mb-6 overflow-hidden rounded-card-lg bg-ink-900 p-6 text-center text-white shadow-card-lg">
        <div className="relative mx-auto mb-3 h-24 w-24">
          <Image src={PLAN_ICON[plan]} alt="" fill className="object-contain" sizes="96px" />
        </div>
        <h2 className="text-title text-white">{PLAN_TITLES[plan]}</h2>
        <p className="text-sm text-white/70">
          Активна до {new Date(status.periodEnd!).toLocaleDateString("ru-RU")}
        </p>
      </div>

      <div className="mb-6 space-y-4 rounded-card bg-white p-5 shadow-card">
        <UsageRow label="Встречи" used={status.events!.used} limit={status.events!.limit} />
        <UsageRow label="Поднятия" used={status.boosts!.used} limit={status.boosts!.limit} />
      </div>

      <button
        onClick={() => setChangingPlan(true)}
        className="w-full rounded-pill border border-lavender-200 bg-white py-4 text-base font-semibold text-accent active:scale-[0.98]"
      >
        Сменить тариф
      </button>
    </div>
  );
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const isUnlimited = limit === null;
  const ratio = isUnlimited ? 0 : Math.min(1, used / Math.max(1, limit));

  return (
    <div>
      <div className="mb-1 flex justify-between text-sm text-ink-900">
        <span>{label}</span>
        <span className="text-ink-600">{isUnlimited ? `${used} · без ограничений` : `${used} / ${limit}`}</span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 overflow-hidden rounded-pill bg-lavender-100">
          <div className="h-full rounded-pill bg-brand-gradient" style={{ width: `${ratio * 100}%` }} />
        </div>
      )}
    </div>
  );
}
ENDOFFILE

mkdir -p "app/api/subscriptions/create-invoice"
cat > "app/api/subscriptions/create-invoice/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createStarsInvoiceLink } from "@/lib/telegram/bot-api";
import { PLAN_LIMITS, type Plan } from "@/lib/subscriptions/limits";

const PLAN_TITLES: Record<Plan, string> = {
  start: "Подписка «Старт»",
  medium: "Подписка «Медиум»",
  premium: "Подписка «Премьер»",
};

/**
 * POST /api/subscriptions/create-invoice
 * Body: { plan: "start" | "medium" | "premium" }
 *
 * Создаёт ссылку на оплату через Telegram Stars. Сама активация подписки
 * происходит НЕ здесь, а на Этапе 25 — в обработчике webhook'а от Telegram
 * после реального успешного платежа (см. app/api/payments/telegram-webhook).
 * Мы никогда не активируем подписку по одному только факту создания инвойса.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const plan = body?.plan as Plan | undefined;

  if (!plan || !(plan in PLAN_LIMITS)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  const limits = PLAN_LIMITS[plan];

  try {
    const invoiceLink = await createStarsInvoiceLink({
      title: PLAN_TITLES[plan],
      description: `Доступ к созданию встреч по тарифу ${plan.toUpperCase()} на 30 дней`,
      payload: JSON.stringify({ userId: user.userId, plan }),
      amountStars: limits.priceStars,
    });

    return NextResponse.json({ invoiceLink });
  } catch {
    return NextResponse.json({ error: "invoice_creation_failed" }, { status: 502 });
  }
}
ENDOFFILE

mkdir -p "components/layout"
cat > "components/layout/BottomNav.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

// Финальная навигация МЕСТО (см. бриф п.16-19): центральный "+" убран,
// вместо него — фирменные 3D-монеты, ведущие на экран тарифов/подписки.
// Создание встречи теперь отдельная CTA на главном экране (п.27), а не
// кнопка в навигации.
const TABS = [
  { href: "/feed", label: "Главная", emoji: "🏠" },
  { href: "/map", label: "Карта", emoji: "📍" },
  { href: "/chats", label: "Чаты", emoji: "💬" },
  { href: "/profile", label: "Профиль", emoji: "👤" },
];

export function BottomNav() {
  const pathname = usePathname();
  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 rounded-t-sheet border-t border-lavender-100 bg-white/95 shadow-card-lg backdrop-blur">
      <div className="mx-auto flex max-w-md items-end justify-between px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        {left.map((tab) => (
          <NavTab key={tab.href} tab={tab} active={pathname === tab.href} />
        ))}

        <Link
          href="/subscriptions"
          aria-label="Тарифы и подписка"
          className="-mt-7 flex flex-col items-center active:scale-95"
        >
          <div className="relative h-14 w-16 drop-shadow-[0_8px_16px_rgba(255,138,42,0.35)]">
            <Image src="/brand/subscription/subscription-coins.png" alt="" fill className="object-contain" sizes="64px" />
          </div>
        </Link>

        {right.map((tab) => (
          <NavTab key={tab.href} tab={tab} active={pathname === tab.href} />
        ))}
      </div>
    </nav>
  );
}

function NavTab({ tab, active }: { tab: (typeof TABS)[number]; active: boolean }) {
  return (
    <Link
      href={tab.href}
      className={clsx(
        "flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-xs",
        active ? "text-accent" : "text-ink-400"
      )}
    >
      <span className="text-xl">{tab.emoji}</span>
      {tab.label}
    </Link>
  );
}
ENDOFFILE

mkdir -p "components/layout"
cat > "components/layout/TopBar.tsx" << 'ENDOFFILE'
"use client";

import Link from "next/link";

interface TopBarProps {
  city: string;
  avatarUrl?: string | null;
  hasUnreadNotifications?: boolean;
  onCityPress?: () => void;
  onNotificationsPress?: () => void;
}

export function TopBar({
  city,
  avatarUrl,
  hasUnreadNotifications = false,
  onCityPress,
  onNotificationsPress,
}: TopBarProps) {
  return (
    <div className="flex items-center justify-between px-5 pt-4">
      <button
        onClick={onCityPress}
        className="flex items-center gap-1 rounded-pill bg-white px-4 py-2 text-sm font-medium shadow-card"
      >
        {city} <span className="text-ink-400">▾</span>
      </button>

      <div className="flex items-center gap-2">
        <button
          onClick={onNotificationsPress}
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-card"
          aria-label="Уведомления"
        >
          🔔
          {hasUnreadNotifications && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
          )}
        </button>

        <Link
          href="/profile"
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-gradient text-sm font-semibold text-white shadow-card"
          aria-label="Профиль"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            "🙂"
          )}
        </Link>
      </div>
    </div>
  );
}
ENDOFFILE

mkdir -p "components/home"
cat > "components/home/CategoryGrid.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

interface CategoryGridProps {
  categories: Category[];
  onTrainingPress: () => void;
}

// 3D-иконки категорий МЕСТО (см. бриф п.9). emoji остаётся как запасной
// вариант, если у какой-то категории вдруг не найдётся своей иконки.
const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/categories/workout.png",
  cinema: "/brand/categories/movie.png",
  coffee: "/brand/categories/coffee.png",
  breakfast: "/brand/categories/breakfast.png",
  dinner: "/brand/categories/dinner.png",
  walk: "/brand/categories/walk.png",
};

export function CategoryGrid({ categories, onTrainingPress }: CategoryGridProps) {
  const router = useRouter();

  const gridCategories = categories.filter((c) => c.slug !== "custom");
  const customCategory = categories.find((c) => c.slug === "custom");

  function handlePress(category: Category) {
    if (category.slug === "training") {
      onTrainingPress();
      return;
    }
    router.push(`/feed?category=${category.slug}`);
  }

  return (
    <div className="px-5">
      <div className="grid grid-cols-2 gap-3">
        {gridCategories.map((category) => (
          <button
            key={category.id}
            onClick={() => handlePress(category)}
            className="flex flex-col items-start gap-2 rounded-card bg-white p-4 text-left shadow-card active:scale-[0.98]"
          >
            {CATEGORY_ICON[category.slug] ? (
              <div className="relative h-11 w-11">
                <Image src={CATEGORY_ICON[category.slug]} alt="" fill className="object-contain" sizes="44px" />
              </div>
            ) : (
              <span className="text-2xl">{category.emoji}</span>
            )}
            <span className="text-sm font-medium leading-tight text-ink-900">
              {category.name}
            </span>
          </button>
        ))}
      </div>

      {customCategory && (
        <button
          onClick={() => router.push("/create?category=custom")}
          className="mt-3 flex w-full items-center gap-3 rounded-card bg-brand-gradient p-4 text-left shadow-card"
        >
          <div className="relative h-9 w-9 shrink-0">
            <Image src="/brand/categories/custom-proposal.png" alt="" fill className="object-contain" sizes="36px" />
          </div>
          <span className="text-sm font-semibold text-white">{customCategory.name}</span>
        </button>
      )}
    </div>
  );
}
ENDOFFILE

mkdir -p "components/paywall"
cat > "components/paywall/PlanCard.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import { Button } from "@/components/ui/Button";
import type { Plan, PlanLimits } from "@/lib/subscriptions/limits";

interface PlanCardProps {
  plan: Plan;
  limits: PlanLimits;
  features: string[];
  highlighted?: boolean;
  loading?: boolean;
  onSelect: (plan: Plan) => void;
}

// Визуальные названия МЕСТО. Backend-идентификаторы (start/medium/premium)
// не меняются — это только отображаемый текст (см. бриф п.22).
const PLAN_TITLES: Record<Plan, string> = {
  start: "Старт",
  medium: "Медиум",
  premium: "Премьер",
};

const PLAN_VISUALS: Record<
  Plan,
  { icon: string; cardClass: string; titleClass: string; textClass: string; buttonVariant: "primary" | "secondary" }
> = {
  start: {
    icon: "/brand/subscription/plan-start-rocket.png",
    cardClass: "bg-white border border-lavender-200",
    titleClass: "text-ink-900",
    textClass: "text-ink-600",
    buttonVariant: "secondary",
  },
  medium: {
    icon: "/brand/subscription/plan-medium-crown.png",
    cardClass: "bg-brand-gradient",
    titleClass: "text-white",
    textClass: "text-white/80",
    buttonVariant: "primary",
  },
  premium: {
    icon: "/brand/subscription/plan-premier-diamond.png",
    cardClass: "bg-ink-900",
    titleClass: "text-white",
    textClass: "text-white/70",
    buttonVariant: "primary",
  },
};

export function PlanCard({ plan, limits, features, highlighted, loading, onSelect }: PlanCardProps) {
  const visual = PLAN_VISUALS[plan];

  return (
    <div className={`relative overflow-hidden rounded-card-lg p-5 shadow-card-lg ${visual.cardClass}`}>
      {highlighted && (
        <span className="absolute right-5 top-5 rounded-pill bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
          Популярный
        </span>
      )}

      <div className="mb-3 flex items-center gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-card-sm">
          <Image src={visual.icon} alt="" fill className="object-cover" sizes="56px" />
        </div>
        <div>
          <h3 className={`text-title ${visual.titleClass}`}>{PLAN_TITLES[plan]}</h3>
          <span className={`text-sm font-semibold ${visual.textClass}`}>{limits.priceRub} ₽/мес</span>
        </div>
      </div>

      <ul className={`mb-4 space-y-1.5 text-sm ${visual.textClass}`}>
        {features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <span>·</span>
            {feature}
          </li>
        ))}
      </ul>

      <Button variant={visual.buttonVariant} onClick={() => onSelect(plan)} disabled={loading}>
        {loading ? "Открываем оплату..." : "Выбрать"}
      </Button>
    </div>
  );
}
ENDOFFILE

mkdir -p "components/ui"
cat > "components/ui/Button.tsx" << 'ENDOFFILE'
import { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "w-full rounded-pill py-4 text-base font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100",
        variant === "primary" && "bg-brand-gradient text-white shadow-cta",
        variant === "secondary" && "bg-white text-ink-900 border border-lavender-200",
        className
      )}
      {...props}
    />
  );
}
ENDOFFILE

mkdir -p "components/map"
cat > "components/map/EventsMap.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useRef } from "react";
import { loadYandexMaps } from "@/lib/maps/load-yandex-maps";

export interface MapEventItem {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  latitude: number;
  longitude: number;
  placeName: string | null;
  seatsLeft: number;
  category: { slug: string; name: string; emoji: string | null } | null;
}

interface EventsMapProps {
  events: MapEventItem[];
  onSelect: (events: MapEventItem[]) => void;
}

const DEFAULT_CENTER: [number, number] = [65.534328, 57.152985]; // Тюмень, запасной центр

// Соответствие slug категории (см. supabase/migrations/0003_categories.sql) фирменным 3D-маркерам МЕСТО.
const MARKER_BY_SLUG: Record<string, string> = {
  training: "/brand/markers/marker-workout.png",
  cinema: "/brand/markers/marker-movie.png",
  coffee: "/brand/markers/marker-coffee.png",
  breakfast: "/brand/markers/marker-breakfast.png",
  dinner: "/brand/markers/marker-dinner.png",
  walk: "/brand/markers/marker-walk.png",
  custom: "/brand/markers/marker-custom.png",
};
const FALLBACK_MARKER = "/brand/markers/marker-custom.png";

export function EventsMap({ events, onSelect }: EventsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    async function setup() {
      const ymaps3 = await loadYandexMaps();
      if (cancelled || !container) return;

      const { YMap, YMapDefaultSchemeLayer, YMapFeatureDataSource, YMapLayer, YMapMarker } = ymaps3 as unknown as {
        YMap: new (el: HTMLElement, opts: unknown) => { addChild: (child: unknown) => unknown };
        YMapDefaultSchemeLayer: new () => unknown;
        YMapFeatureDataSource: new (opts: { id: string }) => unknown;
        YMapLayer: new (opts: { source: string; type: string; zIndex: number }) => unknown;
        YMapMarker: new (opts: { coordinates: [number, number]; source: string }, el: HTMLElement) => unknown;
      };

      const center =
        events.length > 0
          ? ([
              events.reduce((sum, e) => sum + e.longitude, 0) / events.length,
              events.reduce((sum, e) => sum + e.latitude, 0) / events.length,
            ] as [number, number])
          : DEFAULT_CENTER;

      const map = new YMap(container, { location: { center, zoom: 12 } });
      map.addChild(new YMapDefaultSchemeLayer());
      map.addChild(new YMapFeatureDataSource({ id: "events-source" }));
      map.addChild(new YMapLayer({ source: "events-source", type: "markers", zIndex: 1800 }));

      if (events.length === 0) return;

      const { YMapClusterer, clusterByGrid } = (await ymaps3.import("@yandex/ymaps3-clusterer")) as unknown as {
        YMapClusterer: new (props: Record<string, unknown>) => unknown;
        clusterByGrid: (opts: { gridSize: number }) => unknown;
      };
      if (cancelled) return;

      const features = events.map((event) => ({
        type: "Feature" as const,
        id: event.id,
        geometry: { coordinates: [event.longitude, event.latitude] as [number, number] },
        properties: { event },
      }));

      function markerRenderer(feature: (typeof features)[number]) {
        const el = document.createElement("div");
        const src = MARKER_BY_SLUG[feature.properties.event.category?.slug ?? ""] ?? FALLBACK_MARKER;
        el.style.cssText =
          "display:flex;align-items:flex-end;justify-content:center;width:44px;height:56px;cursor:pointer;transition:transform 200ms ease;transform-origin:bottom center;";
        el.innerHTML = `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(90,65,150,0.25));" />`;
        el.addEventListener("click", () => onSelectRef.current([feature.properties.event]));
        return new YMapMarker({ coordinates: feature.geometry.coordinates, source: "events-source" }, el);
      }

      function clusterRenderer(
        coordinates: [number, number],
        clusterFeatures: typeof features
      ) {
        // Белый круглый бейдж с мягкой тенью (см. бриф п.35) — не фирменный цвет,
        // чтобы не спорить визуально с самими маркерами.
        const el = document.createElement("div");
        el.style.cssText =
          "display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:999px;background:#FFFFFF;color:#111111;font-weight:700;font-size:15px;box-shadow:0 6px 16px rgba(90,65,150,0.18);cursor:pointer;";
        el.textContent = String(clusterFeatures.length);
        el.addEventListener("click", () =>
          onSelectRef.current(clusterFeatures.map((f) => f.properties.event))
        );
        return new YMapMarker({ coordinates, source: "events-source" }, el);
      }

      const clusterer = new YMapClusterer({
        method: clusterByGrid({ gridSize: 64 }),
        features,
        marker: markerRenderer,
        cluster: clusterRenderer,
      });

      map.addChild(clusterer);
    }

    setup();

    return () => {
      cancelled = true;
      if (container) container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  return <div ref={containerRef} className="h-full w-full" />;
}
ENDOFFILE

