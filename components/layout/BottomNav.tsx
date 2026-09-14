"use client";

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
          <div
            className={clsx(
              "flex h-12 w-12 items-center justify-center rounded-full shadow-cta",
              pathname === "/search" ? "bg-brand-gradient" : "bg-ink-900"
            )}
          >
            <Image
              src="/brand/icons/location.svg"
              alt=""
              width={22}
              height={22}
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>
          <span className={clsx("text-xs", pathname === "/search" ? "text-accent font-medium" : "text-ink-400")}>
            Встречи
          </span>
        </Link>

        {right.map((tab) => (
          <NavTab key={tab.href} tab={tab} active={pathname === tab.href} />
        ))}
      </div>
    </nav>
  );
}

function NavTab({ tab, active }: { tab: (typeof TABS)[number]; active: boolean }) {
  const src = `/brand/navigation/${tab.icon}-${active ? "active" : "default"}.svg`;
  return (
    <Link
      href={tab.href}
      className={clsx(
        "flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-xs",
        active ? "text-accent font-medium" : "text-ink-400"
      )}
    >
      <Image src={src} alt="" width={24} height={24} />
      {tab.label}
    </Link>
  );
}
