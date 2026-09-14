mkdir -p "app/chats/[id]"
cat > "app/chats/[id]/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { MessageBubble, type MessageData } from "@/components/chat/MessageBubble";
import { createBrowserRealtimeClient } from "@/lib/supabase/browser-realtime";

interface ChatPageProps {
  // Next.js 14 (в этом проекте) передаёт params клиентским компонентам
  // как обычный объект, НЕ как Promise — это фича Next.js 15. Использование
  // React.use(params) здесь было реальным багом: он падает с
  // "client-side exception" при самом первом открытии страницы, потому что
  // use() поддерживает только Promise/Context, а не произвольный объект.
  params: { id: string };
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id: conversationId } = params;
  const router = useRouter();

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<SupabaseClient | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      try {
        const [meRes, tokenRes, historyRes] = await Promise.all([
          fetch("/api/me"),
          fetch("/api/auth/realtime-token"),
          fetch(`/api/conversations/${conversationId}/messages`),
        ]);

        if (!meRes.ok || !tokenRes.ok || !historyRes.ok) {
          if (!cancelled) setError("Не удалось открыть чат.");
          return;
        }

        const [me, tokenData, history] = await Promise.all([
          meRes.json(),
          tokenRes.json(),
          historyRes.json(),
        ]);

        if (cancelled) return;

        setMyUserId(me.userId);
        setMessages(history.messages ?? []);

        const client = createBrowserRealtimeClient(tokenData.token);
        clientRef.current = client;

        const channel = client
          .channel(`conversation:${conversationId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `conversation_id=eq.${conversationId}`,
            },
            (payload) => {
              const row = payload.new as {
                id: string;
                sender_id: string;
                content: string;
                created_at: string;
              };
              setMessages((prev) =>
                prev.some((m) => m.id === row.id)
                  ? prev
                  : [...prev, { id: row.id, senderId: row.sender_id, content: row.content, createdAt: row.created_at }]
              );
            }
          )
          .subscribe();

        channelRef.current = channel;

        // Отмечаем прочитанным при открытии чата
        fetch(`/api/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_read" }),
        }).catch(() => {});
      } catch {
        if (!cancelled) setError("Проблема с соединением.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (channelRef.current) clientRef.current?.removeChannel(channelRef.current);
    };
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend() {
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    setDraft("");
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        setError("Не получилось отправить сообщение.");
        setDraft(content);
      }
    } catch {
      setError("Проблема с соединением.");
      setDraft(content);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-lavender-100 bg-white px-4 py-3">
        <button onClick={() => router.push("/chats")} aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </button>
        <span className="font-medium">Чат</span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {loading && <p className="text-center text-ink-600">Загрузка...</p>}
        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} isOwn={message.senderId === myUserId} />
        ))}
        <div ref={scrollRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-lavender-100 bg-white p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="Написать сообщение..."
          className="flex-1 rounded-pill border border-lavender-200 bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
        />
        <button
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient disabled:opacity-40"
          aria-label="Отправить"
        >
          <Image
            src="/brand/icons/send.svg"
            alt=""
            width={18}
            height={18}
            style={{ filter: "brightness(0) invert(1)" }}
          />
        </button>
      </div>
    </div>
  );
}
ENDOFFILE

mkdir -p "app/(app)/events/[id]/applications"
cat > "app/(app)/events/[id]/applications/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import { ApplicantCard, type ApplicantCardData } from "@/components/applications/ApplicantCard";

interface EventApplicationsPageProps {
  // См. пояснение в app/chats/[id]/page.tsx — params здесь плоский объект
  // (Next.js 14), а не Promise (Next.js 15). use(params) реально ронял
  // страницу с "client-side exception" сразу после первого создания встречи.
  params: { id: string };
}

export default function EventApplicationsPage({ params }: EventApplicationsPageProps) {
  const { id: eventId } = params;

  const [eventTitle, setEventTitle] = useState("");
  const [seats, setSeats] = useState<{ total: number; taken: number } | null>(null);
  const [applications, setApplications] = useState<ApplicantCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/applications`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "forbidden" ? "Это не твоя встреча." : "Не удалось загрузить заявки.");
        return;
      }
      setEventTitle(data.event.title);
      setSeats({ total: data.event.seatsTotal, taken: data.event.seatsTaken });
      setApplications(data.applications);
    } catch {
      setError("Проблема с соединением.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(applicationId: string, action: "accept" | "reject") {
    setProcessingId(applicationId);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await load();
      }
    } finally {
      setProcessingId(null);
    }
  }

  const pending = applications.filter((a) => a.status === "pending");
  const processed = applications.filter((a) => a.status !== "pending");

  return (
    <div className="min-h-screen bg-background px-5 py-6">
      <h1 className="text-display mb-1">{eventTitle || "Заявки"}</h1>
      {seats && (
        <p className="mb-6 text-sm text-ink-600">
          Занято {seats.taken} из {seats.total} мест
        </p>
      )}

      {loading && <p className="text-center text-ink-600">Загрузка...</p>}
      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      {!loading && !error && applications.length === 0 && (
        <div className="rounded-card bg-white p-6 text-center text-sm text-ink-600 shadow-card">
          Пока никто не откликнулся.
        </div>
      )}

      <div className="space-y-3">
        {pending.map((app) => (
          <ApplicantCard
            key={app.id}
            application={app}
            onAccept={(id) => handleAction(id, "accept")}
            onReject={(id) => handleAction(id, "reject")}
            processing={processingId === app.id}
          />
        ))}
        {processed.map((app) => (
          <ApplicantCard
            key={app.id}
            application={app}
            onAccept={() => {}}
            onReject={() => {}}
          />
        ))}
      </div>
    </div>
  );
}
ENDOFFILE

