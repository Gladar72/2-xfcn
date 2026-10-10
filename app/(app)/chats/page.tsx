"use client";

import Image from "next/image";
import { useGuide } from "@/lib/mosya/guide";
import { useEffect, useMemo, useState } from "react";
import { ChatListItem, type ChatListItemData } from "@/components/chat/ChatListItem";

type Tab = "all" | "personal" | "favorites" | "archive";

const isClosed = (c: ChatListItemData) => c.eventStatus === "completed" || c.eventStatus === "cancelled";

export default function ChatsPage() {
  const [chats, setChats] = useState<ChatListItemData[]>([]);
  const [loading, setLoading] = useState(true);
  useGuide("chats");
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data) => setChats(data.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  function handleToggleFavorite(conversationId: string, next: boolean) {
    // Обновляем сразу в интерфейсе, не дожидаясь ответа сервера — звёздочка
    // должна заполняться мгновенно по тапу.
    setChats((prev) => prev.map((c) => (c.conversationId === conversationId ? { ...c, isFavorite: next } : c)));
    fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: next ? "favorite" : "unfavorite" }),
    }).catch(() => {
      // Откатываем при ошибке сети.
      setChats((prev) => prev.map((c) => (c.conversationId === conversationId ? { ...c, isFavorite: !next } : c)));
    });
  }

  // «Все» и «Избранное» — живые чаты; закрытые встречи уходят в «Архив».
  const filtered = useMemo(() => {
    let list =
      tab === "archive" ? chats.filter(isClosed) : chats.filter((c) => !isClosed(c));
    if (tab === "favorites") list = list.filter((c) => c.isFavorite);
    if (tab === "all") list = list.filter((c) => c.eventTitle !== null);
    if (tab === "personal") list = list.filter((c) => c.eventTitle === null);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        [c.eventTitle, c.otherUser?.name, c.lastMessage?.content, c.lastMessage?.senderName]
          .filter(Boolean)
          .some((t) => (t as string).toLowerCase().includes(q))
      );
    }
    return list;
  }, [chats, tab, query]);

  return (
    <div className="px-4 py-6">
      <h1 className="m-title mb-4 text-ink-900">Чаты</h1>

      {/* Поиск по названию встречи, участникам и сообщениям */}
      <label className="mb-3 flex items-center gap-3 rounded-card-sm m-glass px-4 py-3.5">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-ink-400">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по чатам"
          className="min-w-0 flex-1 bg-transparent text-base text-ink-900 outline-none placeholder:text-ink-400"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Очистить поиск" className="shrink-0 px-1 text-lg leading-none text-ink-400">
            ×
          </button>
        )}
      </label>

      {/* Вкладки — три равные кнопки */}
      <div className="m-glass mb-4 grid grid-cols-4 gap-1 rounded-pill p-1">
        {(
          [
            ["all", "Встречи"],
            ["personal", "Личные"],
            ["favorites", "Избранное"],
            ["archive", "Архив"],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-pill py-2 text-[13.5px] font-medium outline-none transition-colors duration-300 focus:outline-none ${
              tab === value ? "bg-ink-900 text-white" : "text-ink-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="m-sk h-[72px]" />)}</div>}

      {!loading && tab === "archive" && filtered.length > 0 && (
        <p className="mb-2 px-1 text-sm font-semibold text-ink-400">Закрытые события · {filtered.length}</p>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <div className="relative mb-4 h-32 w-32">
            <Image src="/brand/mosya/mosya_phone.webp" alt="" fill className="object-contain" sizes="128px" />
          </div>
          <p className="text-sm text-ink-600">
            {query
              ? "Ничего не нашлось."
              : tab === "personal"
                ? "Личные чаты появятся, когда ты напишешь кому-то из профиля — или напишут тебе."
                : tab === "favorites"
                ? "Пока нет избранных чатов — нажми на звёздочку рядом с чатом, чтобы не потерять его."
                : tab === "archive"
                  ? "Здесь будут чаты завершённых встреч."
                  : "Когда вас пригласят на встречу, чат появится здесь."}
          </p>
        </div>
      )}

      <div className="space-y-2.5">
        {filtered.map((chat) => (
          <ChatListItem key={chat.conversationId} chat={chat} onToggleFavorite={handleToggleFavorite} />
        ))}
      </div>
    </div>
  );
}
