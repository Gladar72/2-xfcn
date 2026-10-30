"use client";

import { useRef, useState } from "react";
import { parseInvite, parseSticker } from "@/lib/chat/invite";
import clsx from "clsx";
import { ReadTicks } from "./ReadTicks";
import { photoThumb } from "@/lib/photos/thumb";

export interface MessageReaction {
  emoji: string;
  count: number;
  mine: boolean;
  userIds: string[];
}

export interface MessageReply {
  id: string;
  senderId: string;
  content: string;
  imageUrl: string | null;
  deleted: boolean;
}

export interface MessageData {
  id: string;
  senderId: string;
  content: string;
  /** Фото в сообщении (или локальное превью, пока загружается). */
  imageUrl?: string | null;
  /** Своё сообщение с фото ещё отправляется. */
  uploading?: boolean;
  createdAt: string;
  editedAt?: string | null;
  deleted?: boolean;
  replyTo?: MessageReply | null;
  reactions?: MessageReaction[];
  /** Локальное: своё сообщение отправляется / не ушло (можно повторить). */
  pending?: boolean;
  failed?: boolean;
}

/** Картинка стикера / реакции Моси по slug. */
export function stickerSrc(slug: string): string {
  return slug.startsWith("i_") ? `/brand/cat3d/${slug}.webp` : `/brand/stickers/${slug}.webp`;
}

/** Короткий текст цитаты для ответа. */
export function quoteText(m: { content: string; imageUrl?: string | null; deleted?: boolean }): string {
  if (m.deleted) return "Сообщение удалено";
  if (parseSticker(m.content)) return "Стикер";
  if (parseInvite(m.content)) return "Приглашение на встречу";
  return m.content || (m.imageUrl ? "📷 Фото" : "");
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
  /** Нажатие / долгое нажатие на сообщение — меню (реакции, ответить, изменить…). */
  onMenu?: () => void;
  /** Нажатие на реакцию под сообщением — поставить/снять такую же. */
  onReact?: (emoji: string) => void;
  /** Имя автора цитируемого сообщения. */
  replyName?: string;
  /** Нажатие на цитату — прокрутить к исходному сообщению. */
  onReplyPress?: () => void;
  /** Не ушло — повторить отправку. */
  onRetry?: () => void;
  highlighted?: boolean;
}

/** Сообщение (.m/.bb прототипа): свои — градиент справа, чужие — стекло слева с аватаром. */
export function MessageBubble({ message, isOwn, sender, showSender, onSenderPress, readStatus, readCaption, onOwnPress, onMenu, onReact, replyName, onReplyPress, onRetry, highlighted }: MessageBubbleProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const inviteId = parseInvite(message.content);
  const sticker = message.deleted ? null : parseSticker(message.content);
  const hasImage = !!message.imageUrl;
  const reactions = message.reactions ?? [];
  // Долгое нажатие (как в Telegram) — меню; короткое тоже открывает меню, если не прокрутка.
  const press = useRef<{ t: ReturnType<typeof setTimeout> | null; x: number; y: number; fired: boolean }>({ t: null, x: 0, y: 0, fired: false });
  const openMenu = onMenu && !message.deleted && !message.pending && !message.failed ? onMenu : undefined;

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
        <div
          className={clsx("bb", hasImage && "img", sticker && "stk", highlighted && "hl")}
          onClick={() => {
            if (press.current.fired) return;
            if (openMenu) openMenu();
            else if (isOwn && onOwnPress && !message.uploading) onOwnPress();
          }}
          onContextMenu={(e) => {
            if (!openMenu) return;
            e.preventDefault();
            openMenu();
          }}
          onTouchStart={(e) => {
            const t = e.touches[0];
            press.current.fired = false;
            press.current.x = t.clientX;
            press.current.y = t.clientY;
            if (press.current.t) clearTimeout(press.current.t);
            if (openMenu)
              press.current.t = setTimeout(() => {
                press.current.fired = true;
                try {
                  (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred?: (s: string) => void } } } }).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium");
                } catch {}
                openMenu();
              }, 420);
          }}
          onTouchMove={(e) => {
            const t = e.touches[0];
            if (Math.abs(t.clientX - press.current.x) + Math.abs(t.clientY - press.current.y) > 10 && press.current.t) {
              clearTimeout(press.current.t);
              press.current.t = null;
            }
          }}
          onTouchEnd={() => {
            if (press.current.t) clearTimeout(press.current.t);
            press.current.t = null;
          }}
          style={openMenu || (isOwn && onOwnPress) ? { cursor: "pointer" } : undefined}
        >
          {!isOwn && showSender && sender && <small>{sender.name}</small>}
          {message.replyTo && !message.deleted && (
            <button
              type="button"
              className="mq"
              onClick={(e) => {
                e.stopPropagation();
                onReplyPress?.();
              }}
            >
              <b>{replyName ?? "Сообщение"}</b>
              <span>{quoteText(message.replyTo)}</span>
            </button>
          )}
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
          {message.deleted ? (
            <span style={{ fontStyle: "italic", opacity: 0.7 }}>Сообщение удалено</span>
          ) : sticker ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={stickerSrc(sticker)}
              alt="Стикер"
              style={{ width: 140, height: 140, objectFit: "contain", display: "block" }}
            />
          ) : inviteId ? (
            <a href={`/events/${inviteId}`} className="minv" onClick={(e) => e.stopPropagation()}>
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
          {reactions.length > 0 && (
            <span className="mrx">
              {reactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  className={clsx("mrc", r.mine && "on")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReact?.(r.emoji);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={stickerSrc(r.emoji)} alt="" />
                  {r.count > 1 && <i>{r.count}</i>}
                </button>
              ))}
            </span>
          )}
          <span className="mt">
            {message.editedAt && !message.deleted && "изм. "}
            {formatTime(message.createdAt)}
            {isOwn && !message.failed && (message.pending ? <span className="mpend" aria-label="Отправляется" /> : <ReadTicks status={readStatus ?? "sent"} />)}
          </span>
        </div>
      </div>
      {isOwn && message.failed && (
        <button type="button" className="mfail" onClick={onRetry}>
          Не отправлено · Повторить
        </button>
      )}
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
