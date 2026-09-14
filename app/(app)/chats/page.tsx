"use client";

import Image from "next/image";
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
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <div className="relative mb-4 h-32 w-32">
            <Image src="/brand/3d/empty-chats.png" alt="" fill className="object-contain" sizes="128px" />
          </div>
          <p className="text-sm text-ink-600">Когда вас пригласят на встречу, чат появится здесь.</p>
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
