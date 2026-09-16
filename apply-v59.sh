cat > "app/(app)/chats/page.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ChatListItem, type ChatListItemData } from "@/components/chat/ChatListItem";

type Tab = "all" | "favorites";

export default function ChatsPage() {
  const [chats, setChats] = useState<ChatListItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");

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

  const filtered = useMemo(() => {
    if (tab === "favorites") {
      return chats.filter((c) => c.isFavorite);
    }
    return chats;
  }, [chats, tab]);

  return (
    <div className="px-5 py-6">
      <h1 className="text-display mb-4">Чаты</h1>

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {(
          [
            ["all", "Все"],
            ["favorites", "★ Избранное"],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`shrink-0 rounded-pill border px-4 py-1.5 text-sm font-medium outline-none focus:outline-none ${
              tab === value ? "border-accent bg-brand-gradient text-white" : "border-transparent text-ink-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="text-center text-ink-600">Загрузка...</p>}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <div className="relative mb-4 h-32 w-32">
            <Image src="/brand/3d/empty-chats.png" alt="" fill className="object-contain" sizes="128px" />
          </div>
          <p className="text-sm text-ink-600">
            {tab === "favorites"
              ? "Пока нет избранных чатов — нажми на звёздочку рядом с чатом, чтобы не потерять его."
              : "Когда вас пригласят на встречу, чат появится здесь."}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((chat) => (
          <ChatListItem key={chat.conversationId} chat={chat} onToggleFavorite={handleToggleFavorite} />
        ))}
      </div>
    </div>
  );
}
ENDOFFILE
