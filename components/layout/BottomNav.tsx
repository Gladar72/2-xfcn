"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/brand/Icon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

// Навигация редизайна 2026: тёмная стеклянная «таблетка» внизу, по центру —
// градиентная кнопка «Встречи» (полный список с фильтрами). Состав разделов
// прежний: Главная, Карта, Встречи, Чаты, Профиль.
const TABS = [
  { href: "/feed", label: "Главная", icon: "home" },
  { href: "/map", label: "Карта", icon: "map" },
  { href: "/chats", label: "Чаты", icon: "chat" },
  { href: "/profile", label: "Профиль", icon: "user" },
] as const;

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
    <nav className="m-tabbar" aria-label="Разделы">
      {left.map((tab) => (
        <NavTab key={tab.href} tab={tab} active={pathname === tab.href} />
      ))}

      <Link href="/search" aria-label="Все встречи" className="m-tab-plus">
        <Icon name="search" size={24} strokeWidth={2.2} />
      </Link>

      {right.map((tab) => (
        <NavTab
          key={tab.href}
          tab={tab}
          active={pathname === tab.href}
          badge={tab.href === "/chats" ? unreadChats : 0}
        />
      ))}
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
  return (
    <Link href={tab.href} className={clsx("m-tab", active && "on")} aria-current={active ? "page" : undefined}>
      <Icon name={tab.icon} size={22} />
      <span>{tab.label}</span>
      {badge > 0 && <span className="m-cnt">{badge > 9 ? "9+" : badge}</span>}
    </Link>
  );
}
