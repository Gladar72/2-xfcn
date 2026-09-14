mkdir -p "app"
cat > "app/layout.tsx" << 'ENDOFFILE'
import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import "./globals.css";

// Onest — подлинный вариативный файл шрифта из пакета ассетов (не Google Fonts CDN):
// полностью локально, без внешних сетевых запросов, с поддержкой кириллицы.
const onest = localFont({
  src: "../public/brand/fonts/Onest-Variable.ttf",
  variable: "--font-onest",
  display: "swap",
  weight: "100 900",
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

// 3D-иконки категорий МЕСТО (новый комплект ассетов, см. бриф). emoji остаётся
// как запасной вариант, если у какой-то категории вдруг не найдётся своей иконки.
const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/3d/workout.png",
  cinema: "/brand/3d/movie.png",
  coffee: "/brand/3d/coffee.png",
  breakfast: "/brand/3d/breakfast.png",
  dinner: "/brand/3d/dinner.png",
  walk: "/brand/3d/walk.png",
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
        {gridCategories.map((category) => {
          const iconSrc = CATEGORY_ICON[category.slug];
          return (
            <button
              key={category.id}
              onClick={() => handlePress(category)}
              className="flex flex-col items-start gap-2 rounded-card bg-white p-4 text-left shadow-card active:scale-[0.98]"
            >
              {iconSrc ? (
                <div className="relative h-11 w-11">
                  <Image src={iconSrc} alt="" fill className="object-contain" sizes="44px" />
                </div>
              ) : (
                <span className="text-2xl">{category.emoji}</span>
              )}
              <span className="text-sm font-medium leading-tight text-ink-900">
                {category.name}
              </span>
            </button>
          );
        })}
      </div>

      {customCategory && (
        <button
          onClick={() => router.push("/create")}
          className="mt-3 flex w-full items-center gap-3 rounded-card bg-brand-gradient p-4 text-left shadow-card"
        >
          <div className="relative h-9 w-9 shrink-0">
            <Image src="/brand/3d/custom-proposal.png" alt="" fill className="object-contain" sizes="36px" />
          </div>
          <div>
            <span className="block text-sm font-semibold text-white">{customCategory.name}</span>
            <span className="block text-xs text-white/80">Создай свою встречу</span>
          </div>
        </button>
      )}
    </div>
  );
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
            <Image src="/brand/3d/subscription-coins.png" alt="" fill className="object-contain" sizes="64px" />
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
    icon: "/brand/3d/plan-start.png",
    cardClass: "bg-white border border-lavender-200",
    titleClass: "text-ink-900",
    textClass: "text-ink-600",
    buttonVariant: "secondary",
  },
  medium: {
    icon: "/brand/3d/plan-medium.png",
    cardClass: "bg-brand-gradient",
    titleClass: "text-white",
    textClass: "text-white/80",
    buttonVariant: "primary",
  },
  premium: {
    icon: "/brand/3d/plan-premier.png",
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
  start: "/brand/3d/plan-start.png",
  medium: "/brand/3d/plan-medium.png",
  premium: "/brand/3d/plan-premier.png",
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

// Новые SVG-маркеры (viewBox 256×288, "кончик" пина на y≈269/288 — см.
// CLAUDE_INTEGRATION.md из пакета ассетов). Соответствие slug категории
// (см. supabase/migrations/0003_categories.sql) маркерам МЕСТО.
const MARKER_BY_SLUG: Record<string, string> = {
  training: "/brand/markers/marker-workout.svg",
  cinema: "/brand/markers/marker-movie.svg",
  coffee: "/brand/markers/marker-coffee.svg",
  breakfast: "/brand/markers/marker-breakfast.svg",
  dinner: "/brand/markers/marker-dinner.svg",
  walk: "/brand/markers/marker-walk.svg",
  custom: "/brand/markers/marker-custom.svg",
};
const FALLBACK_MARKER = "/brand/markers/marker-custom.svg";
const MARKER_ASPECT = 288 / 256; // высота/ширина viewBox маркера

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
        const width = 40;
        const height = Math.round(width * MARKER_ASPECT);
        el.style.cssText =
          `position:relative;width:${width}px;height:${height}px;cursor:pointer;transition:transform 200ms ease;transform-origin:bottom center;`;
        el.innerHTML = `<img src="${src}" alt="" width="${width}" height="${height}" style="display:block;width:100%;height:100%;filter:drop-shadow(0 6px 10px rgba(90,65,150,0.25));" />`;
        el.addEventListener("click", () => onSelectRef.current([feature.properties.event]));
        return new YMapMarker({ coordinates: feature.geometry.coordinates, source: "events-source" }, el);
      }

      function clusterRenderer(
        coordinates: [number, number],
        clusterFeatures: typeof features
      ) {
        // Контейнер кластера из нового пакета ассетов + настоящее число поверх
        // (см. CLAUDE_INTEGRATION.md п.9 — рендерить число отдельным слоем, а не
        // вписывать в саму картинку).
        const width = 40;
        const height = Math.round(width * MARKER_ASPECT);
        const el = document.createElement("div");
        el.style.cssText = `position:relative;width:${width}px;height:${height}px;cursor:pointer;`;
        el.innerHTML = `
          <img src="/brand/markers/marker-cluster.svg" alt="" width="${width}" height="${height}"
            style="display:block;width:100%;height:100%;filter:drop-shadow(0 6px 10px rgba(90,65,150,0.25));" />
          <span style="position:absolute;left:0;top:0;width:100%;height:${Math.round(width * 0.85)}px;
            display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">
            ${clusterFeatures.length}
          </span>`;
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

