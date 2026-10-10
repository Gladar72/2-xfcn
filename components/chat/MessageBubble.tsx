"use client";

import { useState } from "react";
import { parseInvite } from "@/lib/chat/invite";
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
  /** Отправитель чужого сообщения — аватар и имя (как в прототипе). */
  sender?: { name: string; avatarUrl: string | null } | null;
  showSender?: boolean;
  onSenderPress?: () => void;
  /** Только для своих сообщений: какую галочку показать. */
  readStatus?: "sent" | "partial" | "read";
  /** Групповой чат: под сообщением — кто прочитал («Прочитали: Ник, Валерия»). */
  readCaption?: string | null;
  /** Нажатие на своё сообщение — открыть список «кто прочитал». */
  onOwnPress?: () => void;
}

/** Сообщение (.m/.bb прототипа): свои — градиент справа, чужие — стекло слева с аватаром. */
export function MessageBubble({ message, isOwn, sender, showSender, onSenderPress, readStatus, readCaption, onOwnPress }: MessageBubbleProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const inviteId = parseInvite(message.content);
  const hasImage = !!message.imageUrl;

  return (
    <>
      <div className={clsx("m", isOwn && "me", "new")}>
        {!isOwn &&
          (sender?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoThumb(sender.avatarUrl, 56)} alt="" onClick={onSenderPress} style={{ cursor: onSenderPress ? "pointer" : undefined, visibility: showSender === false ? "hidden" : undefined }} />
          ) : (
            <span className="mav" onClick={onSenderPress} style={{ visibility: showSender === false ? "hidden" : undefined }}>
              {(sender?.name ?? "?").charAt(0).toUpperCase()}
            </span>
          ))}
        <div className={clsx("bb", hasImage && "img")} onClick={isOwn && onOwnPress && !message.uploading ? onOwnPress : undefined} style={isOwn && onOwnPress ? { cursor: "pointer" } : undefined}>
          {!isOwn && showSender && sender && <small>{sender.name}</small>}
          {message.imageUrl && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!message.uploading) setViewerOpen(true);
              }}
              className="mimg"
              aria-label="Открыть фото"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoThumb(message.imageUrl, 240)} alt="Фото" style={message.uploading ? { opacity: 0.6 } : undefined} />
            </button>
          )}
          {inviteId ? (
            <a href={`/events/${inviteId}`} className="minv">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/mosya/mosya_wave.webp" alt="" style={{ width: 40, height: 40, objectFit: "contain" }} />
                <span>
                  <b style={{ display: "block", fontWeight: 600, fontSize: 14 }}>Приглашение на встречу</b>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>{isOwn ? "Ты позвал на встречу" : "Тебя зовут на встречу"}</span>
                </span>
              </span>
              <span className="minvb">Открыть встречу</span>
            </a>
          ) : (
            message.content && <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message.content}</span>
          )}
          <span className="mt">
            {formatTime(message.createdAt)}
            {isOwn && <ReadTicks status={readStatus ?? "sent"} />}
          </span>
        </div>
      </div>
      {isOwn && readCaption && (
        <button type="button" onClick={onOwnPress} className="mread">
          {readCaption}
        </button>
      )}
      {viewerOpen && message.imageUrl && (
        <div className="mview" onClick={() => setViewerOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoThumb(message.imageUrl, 640)} alt="Фото" />
        </div>
      )}
    </>
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
