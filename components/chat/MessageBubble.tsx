"use client";

import { useState } from "react";
import clsx from "clsx";
import { ReadTicks } from "./ReadTicks";
import { photoThumb } from "@/lib/photos/thumb";

export interface MessageData {
  id: string;
  senderId: string;
  content: string;
  /** Фото в сообщении (или локальное превью, пока загружается). */
  imageUrl?: string | null;
  /** Своё сообщение с фото ещё отправляется. */
  uploading?: boolean;
  createdAt: string;
}

interface MessageBubbleProps {
  message: MessageData;
  isOwn: boolean;
  /** Только для своих сообщений: показать ли и какую галочку. */
  readStatus?: "sent" | "read";
}

export function MessageBubble({ message, isOwn, readStatus }: MessageBubbleProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const hasImage = !!message.imageUrl;

  return (
    <div className={clsx("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[75%] text-sm",
          hasImage ? "p-1" : "px-4 py-2.5",
          isOwn
            ? "bg-accent text-white rounded-[22px_22px_6px_22px]"
            : "bg-lavender-100 text-ink-900 rounded-[22px_22px_22px_6px]"
        )}
      >
        {message.imageUrl && (
          <button
            type="button"
            onClick={() => !message.uploading && setViewerOpen(true)}
            className="relative block overflow-hidden rounded-[18px]"
            aria-label="Открыть фото"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoThumb(message.imageUrl, 240)}
              alt="Фото"
              className={clsx(
                "block max-h-80 w-60 max-w-full object-cover",
                message.uploading && "opacity-60"
              )}
            />
            {message.uploading && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
              </span>
            )}
          </button>
        )}
        <div className={clsx(hasImage && "px-3 pb-1.5 pt-1")}>
          {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
          <span
            className={clsx(
              "mt-1 flex items-center justify-end gap-1 text-[10px]",
              isOwn ? "text-white/70" : "text-ink-400"
            )}
          >
            {formatTime(message.createdAt)}
            {isOwn && <ReadTicks status={readStatus ?? "sent"} />}
          </span>
        </div>
      </div>

      {viewerOpen && message.imageUrl && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setViewerOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoThumb(message.imageUrl, 640)}
            alt="Фото"
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  );
}


function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (isSameDay(date, today)) return "Сегодня";
  if (isSameDay(date, yesterday)) return "Вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
