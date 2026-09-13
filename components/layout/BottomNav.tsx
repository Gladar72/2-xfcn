"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/feed", label: "Лента", emoji: "🏠" },
  { href: "/map", label: "Карта", emoji: "📍" },
  { href: "/create", label: "Создать", emoji: "➕", isCenter: true },
  { href: "/chats", label: "Чаты", emoji: "💬" },
  { href: "/profile", label: "Профиль", emoji: "👤" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-400/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-end justify-between px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          if (tab.isCenter) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl text-white shadow-card active:scale-95"
              >
                {tab.emoji}
              </Link>
            );
          }
          return (
            <Link
              key={tab.href}
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
        })}
      </div>
    </nav>
  );
}
