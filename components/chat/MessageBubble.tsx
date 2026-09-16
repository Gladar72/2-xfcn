import clsx from "clsx";
import { ReadTicks } from "./ReadTicks";

export interface MessageData {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

interface MessageBubbleProps {
  message: MessageData;
  isOwn: boolean;
  /** Только для своих сообщений: показать ли и какую галочку. */
  readStatus?: "sent" | "read";
}

export function MessageBubble({ message, isOwn, readStatus }: MessageBubbleProps) {
  return (
    <div className={clsx("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[75%] px-4 py-2.5 text-sm",
          isOwn
            ? "bg-accent text-white rounded-[22px_22px_6px_22px]"
            : "bg-lavender-100 text-ink-900 rounded-[22px_22px_22px_6px]"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
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
