"use client";

import { useEffect, useState } from "react";
import { ChatListItem, type ChatListItemData } from "@/components/chat/ChatListItem";

export default function ChatsPage() {
  const [chats, setChats] = useState<ChatListItemData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data) => setChats(data.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-5 py-6">
      <h1 className="text-display mb-4">Чаты</h1>

      {loading && <p className="text-center text-ink-600">Загрузка...</p>}

      {!loading && chats.length === 0 && (
        <div className="rounded-card bg-white p-6 text-center text-sm text-ink-600 shadow-card">
          Когда вас пригласят на встречу, чат появится здесь.
        </div>
      )}

      <div className="space-y-2">
        {chats.map((chat) => (
          <ChatListItem key={chat.conversationId} chat={chat} />
        ))}
      </div>
    </div>
  );
}
