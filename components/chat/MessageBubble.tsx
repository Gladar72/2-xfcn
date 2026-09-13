"use client";

import clsx from "clsx";

export interface MessageData {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

interface MessageBubbleProps {
  message: MessageData;
  isOwn: boolean;
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  return (
    <div className={clsx("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
          isOwn ? "bg-accent text-white" : "bg-white text-ink-900 shadow-card"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <span className={clsx("mt-1 block text-right text-[10px]", isOwn ? "text-white/70" : "text-ink-400")}>
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
