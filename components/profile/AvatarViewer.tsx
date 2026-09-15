"use client";

import { useState } from "react";

interface AvatarViewerProps {
  src: string;
  alt: string;
  children: React.ReactNode;
}

/**
 * Оборачивает аватар: клик открывает фото на весь экран (тап — закрыть),
 * как в Instagram. Чисто фронтенд-функция, не требует изменений в БД.
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
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-full max-w-full rounded-2xl object-contain" />
        </div>
      )}
    </>
  );
}
