mkdir -p "app"
cat > "app/globals.css" << 'ENDOFFILE'
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body {
  max-width: 100vw;
  overflow-x: hidden;
}

/* Полоса загрузки на стартовом экране (app/page.tsx) — плавно наполняется,
   не привязана к реальному прогрессу (сама проверка занимает доли секунды),
   просто даёт ощущение "приложение открывается", а не мгновенный скачок. */
@keyframes splash-progress {
  0% { width: 0%; }
  70% { width: 88%; }
  100% { width: 96%; }
}
.splash-progress-bar {
  animation: splash-progress 1.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* Скрываем необязательную кнопку "Открыть Яндекс Карты" — это удобство,
   а не обязательная атрибуция. Условия использования (обязательная ссылка,
   класс ymaps3--map-copyrights__user-agreements) остаются на месте. */
.ymaps3--controls_bottom.ymaps3--controls_left.ymaps3--controls_horizontal {
  display: none !important;
}
ENDOFFILE

mkdir -p "components/layout"
cat > "components/layout/BottomNav.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

// Финальная навигация МЕСТО: по центру — переход к полному списку встреч
// с фильтрами (раньше здесь были монеты подписки; монеты переехали в
// профиль — см. app/(app)/profile/page.tsx, карточка "Мой пакет").
const TABS = [
  { href: "/feed", label: "Главная", icon: "nav-home" },
  { href: "/map", label: "Карта", icon: "nav-map" },
  { href: "/chats", label: "Чаты", icon: "nav-chat" },
  { href: "/profile", label: "Профиль", icon: "nav-profile" },
];

export function BottomNav() {
  const pathname = usePathname();
  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)];
  const [unreadChats, setUnreadChats] = useState(0);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data) => {
        const total = (data.items ?? []).reduce(
          (sum: number, item: { unreadCount: number }) => sum + (item.unreadCount || 0),
          0
        );
        setUnreadChats(total);
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 rounded-t-sheet border-t border-lavender-100 bg-white/95 shadow-card-lg backdrop-blur">
      <div className="mx-auto flex max-w-md items-end justify-between px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        {left.map((tab) => (
          <NavTab key={tab.href} tab={tab} active={pathname === tab.href} />
        ))}

        <Link
          href="/search"
          aria-label="Поиск встреч"
          className="-mt-5 flex flex-col items-center gap-1 active:scale-95"
        >
          <div className="relative h-12 w-12 drop-shadow-[0_6px_14px_rgba(108,59,255,0.35)]">
            <Image src="/brand/3d/location-pin.png" alt="" fill className="object-contain" sizes="48px" />
          </div>
          <span className={clsx("text-xs", pathname === "/search" ? "text-accent font-medium" : "text-ink-400")}>
            Встречи
          </span>
        </Link>

        {right.map((tab) => (
          <NavTab
            key={tab.href}
            tab={tab}
            active={pathname === tab.href}
            badge={tab.href === "/chats" ? unreadChats : 0}
          />
        ))}
      </div>
    </nav>
  );
}

function NavTab({
  tab,
  active,
  badge = 0,
}: {
  tab: (typeof TABS)[number];
  active: boolean;
  badge?: number;
}) {
  const src = `/brand/navigation/${tab.icon}-${active ? "active" : "default"}.svg`;
  return (
    <Link
      href={tab.href}
      className={clsx(
        "relative flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-xs",
        active ? "text-accent font-medium" : "text-ink-400"
      )}
    >
      <span className="relative">
        <Image src={src} alt="" width={24} height={24} />
        {badge > 0 && (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      {tab.label}
    </Link>
  );
}
ENDOFFILE

