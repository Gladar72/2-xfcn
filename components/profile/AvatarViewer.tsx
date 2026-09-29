"use client";

import { useState } from "react";
import { photoThumb } from "@/lib/photos/thumb";

interface AvatarViewerProps {
  src: string;
  alt: string;
  children: React.ReactNode;
}

/**
 * Оборачивает аватар: клик открывает фото на весь экран (тап — закрыть).
 * Круглая рамка увеличенного фото — как в Telegram (раньше был квадрат со
 * скруглёнными углами, как в Instagram, — поменяно по явному запросу
 * пользователя). Чисто фронтенд-функция, не требует изменений в БД.
 */
export function AvatarViewer({ src, alt, children }: AvatarViewerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="contents" aria-label="Открыть фото">
        {children}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-8"
          onClick={() => setOpen(false)}
        >
          <div className="aspect-square w-full max-w-sm overflow-hidden rounded-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoThumb(src, 400)} alt={alt} className="h-full w-full object-cover" />
          </div>
        </div>
      )}
    </>
  );
}
