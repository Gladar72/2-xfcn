"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/brand/Icon";
import Link from "next/link";
import { AvatarViewer } from "@/components/profile/AvatarViewer";
import { photoThumb } from "@/lib/photos/thumb";

interface TopBarProps {
  city: string;
  avatarUrl?: string | null;
  onCityPress?: () => void;
}

export function TopBar({ city, avatarUrl, onCityPress }: TopBarProps) {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => setHasUnread((data.items ?? []).some((n: { isRead: boolean }) => !n.isRead)))
      .catch(() => {});
  }, []);

  const avatarCircle = (
    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-brand-gradient text-sm font-semibold text-white shadow-cta">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoThumb(avatarUrl, 44)} alt="" className="h-full w-full object-cover" />
      ) : (
        <Icon name="user" size={20} />
      )}
    </div>
  );

  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4">
      <button onClick={onCityPress} className="m-press text-left">
        <small className="block text-xs text-ink-400">Ищем компанию</small>
        <span className="flex items-center gap-1 text-[17px] font-medium">
          {city} <Icon name="down" size={16} />
        </span>
      </button>

      <div className="flex items-center gap-2">
        <Link
          href="/notifications"
          className="m-glass m-press relative flex h-11 w-11 items-center justify-center rounded-full"
          aria-label="Уведомления"
        >
          <Icon name="bell" size={21} />
          {hasUnread && <span className="m-dot" />}
        </Link>

        {/* Тап по аватару на главной — сразу крупное фото (как в профиле),
            а не переход в профиль: для этого уже есть отдельная вкладка
            внизу. Если фото нет — вести некуда, оставляем ссылкой в профиль. */}
        {avatarUrl ? (
          <AvatarViewer src={avatarUrl} alt="Фото профиля">
            {avatarCircle}
          </AvatarViewer>
        ) : (
          <Link href="/profile" aria-label="Профиль">
            {avatarCircle}
          </Link>
        )}
      </div>
    </div>
  );
}
