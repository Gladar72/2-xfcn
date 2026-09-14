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
