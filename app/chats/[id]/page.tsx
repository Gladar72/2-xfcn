"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { MessageBubble, formatDayLabel, quoteText, stickerSrc, type MessageData, type MessageReaction } from "@/components/chat/MessageBubble";
import { parseInvite, parseSticker } from "@/lib/chat/invite";
import { MiniProfileSheet } from "@/components/chat/MiniProfileSheet";
import { CATEGORY_ICON } from "@/lib/data/category-icons";
import { createBrowserRealtimeClient } from "@/lib/supabase/browser-realtime";
import { useTelegramViewportHeight } from "@/lib/telegram/webapp-client";
import { useVisualViewportHeight } from "@/lib/hooks/use-visual-viewport-height";
import { useLockBodyScroll } from "@/lib/hooks/use-lock-body-scroll";
import { useChatScroll } from "@/lib/hooks/use-chat-scroll";
import { photoThumb } from "@/lib/photos/thumb";
import { EmptyIll, Ic, Sheet } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";

interface ChatPageProps {
  // Next.js 14 (в этом проекте) передаёт params клиентским компонентам
  // как обычный объект, НЕ как Promise — это фича Next.js 15. Использование
  // React.use(params) здесь было реальным багом: он падает с
  // "client-side exception" при самом первом открытии страницы, потому что
  // use() поддерживает только Promise/Context, а не произвольный объект.
  params: { id: string };
}

interface Member {
  id: string;
  name: string;
  avatarUrl: string | null;
  age: number | null;
  gender: string | null;
  completedMeetingsCount: number;
  lastReadAt: string | null;
  /** Анонимная встреча: профиль скрыт — открывать нельзя. */
  anonymous?: boolean;
}

type ParticipantsTab = "all" | "organizer" | "participants";

const PARTICIPANTS_PAGE_SIZE = 7;

export default function ChatPage({ params }: ChatPageProps) {
  return <ChatConversation key={params.id} conversationId={params.id} />;
}

function ChatConversation({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  useLockBodyScroll();

  const visualViewportHeight = useVisualViewportHeight();
  const telegramViewportHeight = useTelegramViewportHeight();
  // Округляем: iOS присылает дробные изменения высоты при прокрутке — без округления чат «прилипал» к низу.
  const rawHeight = visualViewportHeight ?? telegramViewportHeight;
  const liveHeight = rawHeight == null ? rawHeight : Math.round(rawHeight);

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [eventStatus, setEventStatus] = useState<string | null>(null);
  const [category, setCategory] = useState<{ slug: string; name: string; emoji: string | null } | null>(null);
  const [isBusiness, setIsBusiness] = useState(false);
  const [organizerId, setOrganizerId] = useState<string | null>(null);
  const [eventPhotoUrl, setEventPhotoUrl] = useState<string | null>(null);
  const [eventMeta, setEventMeta] = useState<{ id: string; date: string | null; time: string | null; place: string | null; address: string | null } | null>(null);
  // Все ОСТАЛЬНЫЕ участники чата (не считая себя) — на встречу с 3-4
  // принятыми людьми это будет несколько человек, не один собеседник.
  const [members, setMembers] = useState<Member[]>([]);
  const [showMiniProfileFor, setShowMiniProfileFor] = useState<string | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);
  // Своё сообщение, для которого открыт список «кто прочитал» (групповой чат).
  const [readersFor, setReadersFor] = useState<MessageData | null>(null);
  const [participantsTab, setParticipantsTab] = useState<ParticipantsTab>("all");
  const [participantsExpanded, setParticipantsExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  // Фото, выбранное через «+» и ещё не отправленное (уже ужатое, data URL).
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  // Меню сообщения (реакции, ответить, изменить, удалить), ответ, правка, стикеры.
  const [menuFor, setMenuFor] = useState<MessageData | null>(null);
  const [replyTo, setReplyTo] = useState<MessageData | null>(null);
  const [editing, setEditing] = useState<MessageData | null>(null);
  const [deleteFor, setDeleteFor] = useState<MessageData | null>(null);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [stickerTab, setStickerTab] = useState<"mosya" | "interests">("mosya");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((t: string) => {
    setToast(t);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const myIdRef = useRef<string | null>(null);
  // Сообщения, загруженные из истории, — без анимации появления (иначе при входе дёргается весь список).
  const quietIdsRef = useRef(new Set<string>());
  const markQuiet = (list: { id: string }[]) => list.forEach((m) => quietIdsRef.current.add(m.id));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessBlocked, setAccessBlocked] = useState(false);

  const composeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const {
    listRef, contentRef, atBottom, unseen, handleScroll: updateScrollPosition,
    interruptScroll, scrollToBottom, followOutput, preservePosition,
  } = useChatScroll(messages, myUserId, !loading && myUserId !== null && !accessBlocked);
  const loadingOlderRef = useRef(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [composeH, setComposeH] = useState(150);
  const clientRef = useRef<SupabaseClient | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          if (historyRes.status === 403) {
            const data = await historyRes.json().catch(() => ({}));
            if (data.error === "event_closed" && !cancelled) {
              setAccessBlocked(true);
              return;
            }
          }
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
        myIdRef.current = me.userId;
        markQuiet(history.messages ?? []);
        setMessages(((history.messages ?? []) as MessageData[]).map(normMessage));
        setHasMore(!!history.hasMore);
        setEventTitle(history.eventTitle ?? null);
        setEventStatus(history.eventStatus ?? null);
        setCategory(history.category ?? null);
        setIsBusiness(history.isBusiness ?? false);
        setOrganizerId(history.organizerId ?? null);
        setEventPhotoUrl(history.eventPhotoUrl ?? null);
        setEventMeta(
          history.eventId
            ? { id: history.eventId, date: history.eventDate, time: history.eventTime, place: history.eventPlace, address: history.eventAddress }
            : null
        );
        setMembers(history.members ?? []);

        const client = createBrowserRealtimeClient(tokenData.token);
        clientRef.current = client;

        // Broadcast вместо postgres_changes: сервер сам рассылает новые
        // сообщения и «прочитано» в приватный канал чата (слушать его могут
        // только участники — политика в миграции 0033). Так Realtime не
        // проверяет права на каждую вставку для каждого подписчика.
        const channel = client
          .channel(`conversation:${conversationId}`, { config: { private: true } })
          .on("broadcast", { event: "message" }, ({ payload }) => {
            const row = payload as MessageData & { reactions?: { emoji: string; userIds: string[] }[] };
            if (!row?.id) return;
            const incoming = normMessage({ ...row, reactions: shapeReactions(row.reactions, me.userId) });
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              // Своё сообщение может прийти по каналу раньше ответа POST —
              // тогда заменяем им временную копию, а не дублируем.
              const tempIndex = prev.findIndex(
                (m) =>
                  m.id.startsWith("temp-") &&
                  m.senderId === row.senderId &&
                  m.content === row.content &&
                  !!m.imageUrl === !!row.imageUrl
              );
              if (tempIndex !== -1) {
                quietIdsRef.current.add(incoming.id);
                return prev.map((m, i) => (i === tempIndex ? incoming : m));
              }
              return [...prev, incoming];
            });
            // Чат открыт — отмечаем входящие прочитанными (не чаще раза в 3 с).
            if (row.senderId !== me.userId && !markReadTimerRef.current) {
              markReadTimerRef.current = setTimeout(() => {
                markReadTimerRef.current = null;
                fetch(`/api/conversations/${conversationId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "mark_read" }),
                }).catch(() => {});
              }, 3000);
            }
          })
          .on("broadcast", { event: "edit" }, ({ payload }) => {
            const p = payload as { id: string; content: string; editedAt: string };
            if (!p?.id) return;
            setMessages((prev) => prev.map((m) => (m.id === p.id ? { ...m, content: p.content, editedAt: p.editedAt } : m)));
          })
          .on("broadcast", { event: "delete" }, ({ payload }) => {
            const p = payload as { id: string };
            if (!p?.id) return;
            setMessages((prev) => prev.map((m) => (m.id === p.id ? { ...m, deleted: true, content: "", imageUrl: null, reactions: [] } : m)));
          })
          .on("broadcast", { event: "reaction" }, ({ payload }) => {
            const p = payload as { id: string; reactions: { emoji: string; userIds: string[] }[] };
            if (!p?.id) return;
            setMessages((prev) => prev.map((m) => (m.id === p.id ? { ...m, reactions: shapeReactions(p.reactions, me.userId) } : m)));
          })
          .on("broadcast", { event: "read" }, ({ payload }) => {
            const row = payload as { userId: string; lastReadAt: string | null };
            if (!row?.userId || row.userId === me.userId) return;
            setMembers((prev) => prev.map((m) => (m.id === row.userId ? { ...m, lastReadAt: row.lastReadAt } : m)));
          })
          .subscribe();

        channelRef.current = channel;

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
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
      markReadTimerRef.current = null;
    };
  }, [conversationId]);

  // Высота панели нужна только для расположения кнопки «вниз»; сообщения занимают оставшееся место через flex.
  useEffect(() => {
    const el = composeRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setComposeH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingOlderRef.current || messages.length === 0) return;
    const first = messages.find((m) => !m.id.startsWith("temp-"));
    if (!first) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const r = await fetch(`/api/conversations/${conversationId}/messages?before=${encodeURIComponent(first.createdAt)}&limit=50`);
      if (!r.ok) throw new Error("history_request_failed");
      const d = (await r.json()) as { messages?: MessageData[]; hasMore?: boolean };
      const older = (d.messages ?? []).map(normMessage);
      markQuiet(older);
      // Capture after the request: the reader may have moved while it was loading.
      preservePosition();
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !ids.has(m.id)), ...prev];
      });
      setHasMore(!!d.hasMore);
    } catch {
      showToast("Не удалось загрузить историю. Попробуй ещё раз.");
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [hasMore, messages, conversationId, preservePosition, showToast]);

  function handleScroll() {
    updateScrollPosition();
    const el = listRef.current;
    if (el && !loading && el.scrollTop < 240) void loadOlder();
  }

  // Вернулись в приложение (телефон спал, переключались) — догружаем пропущенное.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      fetch(`/api/conversations/${conversationId}/messages`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { messages?: MessageData[] } | null) => {
          if (!d?.messages) return;
          const server = new Map(d.messages.map((m) => [m.id, normMessage(m)]));
          setMessages((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            const fresh = [...server.values()].filter((m) => !ids.has(m.id));
            // Пока были в фоне: правки, удаления и реакции тоже обновляем.
            const merged = prev.map((m) => server.get(m.id) ?? m);
            return [...merged, ...fresh].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
          });
        })
        .catch(() => {});
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [conversationId]);

  // Экран не должен ездить вбок (iOS сдвигает страницу, подводя поле под клавиатуру).
  useEffect(() => {
    const fix = () => {
      if (window.scrollX !== 0 || document.documentElement.scrollLeft !== 0) window.scrollTo(0, window.scrollY);
    };
    const vv = window.visualViewport;
    vv?.addEventListener("scroll", fix);
    vv?.addEventListener("resize", fix);
    window.addEventListener("scroll", fix, { passive: true });
    return () => {
      vv?.removeEventListener("scroll", fix);
      vv?.removeEventListener("resize", fix);
      window.removeEventListener("scroll", fix);
    };
  }, []);

  // Поле ввода растёт по тексту (до 5 строк), как в Telegram.
  useLayoutEffect(() => {
    const t = inputRef.current;
    if (!t) return;
    t.style.height = "0px";
    t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
  }, [draft]);

  // «+» → системное окно выбора фото (галерея / камера). Доступ к фото
  // телефон запрашивает сам, как в Telegram. Фото сразу ужимаем на
  // телефоне (до 1600 px, JPEG) — отправляется быстро даже по мобильной сети.
  async function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // чтобы можно было выбрать то же фото ещё раз
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Можно отправить только фото.");
      return;
    }
    setPreparingImage(true);
    try {
      setPendingImage(await compressImage(file));
      setError(null);
    } catch {
      setError("Не получилось открыть это фото. Попробуйте другое.");
    } finally {
      setPreparingImage(false);
    }
  }

  // Отправка как в Telegram: сообщение сразу в ленте; при сбое сети — повторы,
  // а если так и не ушло — остаётся с «Не отправлено · Повторить» (не пропадает).
  const bodiesRef = useRef(new Map<string, { content: string; image?: string; replyToId?: string }>());

  async function postMessage(tempId: string, body: { content: string; image?: string; replyToId?: string }) {
    bodiesRef.current.set(tempId, body);
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: true, failed: false } : m)));
    const startedAt = Date.now();
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await sleep(attempt === 1 ? 1200 : 3000);
        // Ответ мог потеряться, а сообщение — сохраниться: проверяем, чтобы не задвоить.
        try {
          const r = await fetch(`/api/conversations/${conversationId}/messages?limit=20`);
          const d = r.ok ? ((await r.json()) as { messages?: MessageData[] }) : null;
          const found = d?.messages?.find(
            (m) => m.senderId === myIdRef.current && m.content === body.content && Date.parse(m.createdAt) >= startedAt - 60_000 && !!m.imageUrl === !!body.image
          );
          if (found) {
            quietIdsRef.current.add(found.id);
            setMessages((prev) => (prev.some((m) => m.id === found.id) ? prev.filter((m) => m.id !== tempId) : prev.map((m) => (m.id === tempId ? normMessage(found) : m))));
            bodiesRef.current.delete(tempId);
            return;
          }
        } catch {}
      }
      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.messageId) {
          bodiesRef.current.delete(tempId);
          quietIdsRef.current.add(data.messageId);
          setMessages((prev) =>
            prev.some((m) => m.id === data.messageId)
              ? prev.filter((m) => m.id !== tempId)
              : prev.map((m) =>
                  m.id === tempId
                    ? { ...m, id: data.messageId, createdAt: data.createdAt ?? m.createdAt, imageUrl: data.imageUrl ?? m.imageUrl, uploading: false, pending: false, failed: false }
                    : m
                )
          );
          return;
        }
        // Ошибки, которые повтором не исправить: убираем и возвращаем текст в поле.
        if (res.status >= 400 && res.status < 500) {
          bodiesRef.current.delete(tempId);
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setDraft((d) => d || body.content);
          if (body.image) setPendingImage((p) => p ?? body.image ?? null);
          showToast(
            data.error === "photo_rejected"
              ? "Фото не прошло проверку и не может быть отправлено."
              : data.error === "photo_too_large"
                ? "Фото слишком большое."
                : data.error === "photo_invalid"
                  ? "Этот формат фото не поддерживается."
                  : data.error === "event_closed"
                    ? "Событие закрыто — писать в чат уже нельзя."
                    : data.error === "message_too_long"
                      ? "Слишком длинное сообщение."
                      : res.status === 401
                        ? "Сессия устарела — перезапусти приложение."
                        : "Не получилось отправить сообщение."
          );
          return;
        }
      } catch {
        // сеть — пробуем ещё раз
      }
    }
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
    showToast("Нет связи — сообщение не отправлено. Нажми «Повторить».");
  }

  function retryMessage(m: MessageData) {
    const body = bodiesRef.current.get(m.id) ?? { content: m.content, replyToId: m.replyTo?.id };
    postMessage(m.id, body);
  }

  function sendNew(content: string, image?: string | null) {
    if (!myUserId || isEventClosed) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const reply = replyTo;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        senderId: myUserId,
        content,
        imageUrl: image ?? null,
        uploading: !!image,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deleted: false,
        replyTo: reply ? { id: reply.id, senderId: reply.senderId, content: reply.content.slice(0, 200), imageUrl: reply.imageUrl ?? null, deleted: !!reply.deleted } : null,
        reactions: [],
        pending: true,
      },
    ]);
    followOutput();
    setReplyTo(null);
    postMessage(tempId, { content, ...(image ? { image } : {}), ...(reply ? { replyToId: reply.id } : {}) });
  }

  async function handleSend() {
    const content = draft.trim();
    const image = pendingImage;
    if ((!content && !image) || !myUserId || isEventClosed) return;
    if (editing) {
      const target = editing;
      setEditing(null);
      setDraft("");
      if (content === target.content) return;
      setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, content, editedAt: new Date().toISOString() } : m)));
      setSending(true);
      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages/${target.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, content: target.content, editedAt: target.editedAt } : m)));
          showToast(data.error === "edit_expired" ? "Изменить можно в течение 48 часов" : "Не удалось изменить");
        }
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, content: target.content, editedAt: target.editedAt } : m)));
        showToast("Нет связи — не удалось изменить");
      } finally {
        setSending(false);
      }
      return;
    }
    setDraft("");
    setPendingImage(null);
    sendNew(content, image);
  }

  function sendSticker(slug: string) {
    setStickersOpen(false);
    sendNew(`[[sticker:${slug}]]`);
  }

  async function toggleReaction(m: MessageData, emoji: string) {
    if (!myUserId || m.id.startsWith("temp-") || isEventClosed) return;
    const before = m.reactions ?? [];
    const had = before.find((r) => r.mine)?.emoji;
    const lists = before.map((r) => ({ emoji: r.emoji, userIds: r.userIds.filter((u) => u !== myUserId) }));
    if (had !== emoji) {
      const g = lists.find((r) => r.emoji === emoji);
      if (g) g.userIds.push(myUserId);
      else lists.push({ emoji, userIds: [myUserId] });
    }
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: shapeReactions(lists, myUserId) } : x)));
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages/${m.id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { reactions: { emoji: string; userIds: string[] }[] };
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: shapeReactions(data.reactions, myUserId) } : x)));
    } catch {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: before } : x)));
      showToast("Не удалось поставить реакцию");
    }
  }

  async function deleteMessage(m: MessageData) {
    setDeleteFor(null);
    const before = m;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, deleted: true, content: "", imageUrl: null, reactions: [] } : x)));
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages/${m.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? before : x)));
      showToast("Не удалось удалить");
    }
  }

  function jumpTo(id: string) {
    const el = document.getElementById(`m-${id}`);
    if (!el) {
      showToast("Сообщение выше — пролистай историю");
      return;
    }
    const list = listRef.current;
    if (!list) return;
    interruptScroll();
    list.scrollTo({
      top: list.scrollTop + el.getBoundingClientRect().top - list.getBoundingClientRect().top - (list.clientHeight - el.offsetHeight) / 2,
      behavior: "smooth",
    });
    setHighlightId(id);
    setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 1400);
  }

  function nameOf(userId: string): string {
    if (userId === myUserId) return "Ты";
    return members.find((m) => m.id === userId)?.name ?? "Участник";
  }

  function openParticipants() {
    setParticipantsTab("all");
    setParticipantsExpanded(false);
    setShowParticipants(true);
  }

  const isEventClosed = eventStatus === "completed" || eventStatus === "cancelled";
  const headerTitle = eventTitle ?? (members.length === 1 ? (members[0]?.name ?? "Чат") : "Чат");
  const soleMember = members.length === 1 ? members[0] : null;
  const categoryIcon = isBusiness ? "/brand/cat3d/i_biz.webp" : category ? CATEGORY_ICON[category.slug] : undefined;
  const totalParticipantsCount = members.length + 1; // +1 — сам зашедший пользователь

  const visibleParticipants =
    participantsTab === "organizer"
      ? members.filter((m) => m.id === organizerId)
      : participantsTab === "participants"
        ? members.filter((m) => m.id !== organizerId)
        : members;
  const participantsToShow = participantsExpanded
    ? visibleParticipants
    : visibleParticipants.slice(0, PARTICIPANTS_PAGE_SIZE);
  const hiddenParticipantsCount = visibleParticipants.length - participantsToShow.length;

  if (accessBlocked) {
    return (
      <div className="P">
        <section className="scr aurora fade" data-id="chat">
          <div className="scroll">
            <div className="bar-top">
              <button className="rb gl" onClick={() => goBack(router, "/chats")} aria-label="Назад">
                <Ic n="back" />
              </button>
              <span />
            </div>
            <div className="empty" style={{ marginTop: 60 }}>
              <b>Чат недоступен</b>
              <span>Событие уже прошло или было отменено. История сохранится в архиве.</span>
              <button className="btn v" style={{ width: "100%", marginTop: 8 }} onClick={() => router.push("/chats")}>
                Назад к чатам
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const quick = eventTitle !== null ? ["Я в пути", "Опаздываю на 5 минут", "Уже на месте", "Кто во сколько?"] : ["Привет! Пойдёшь на кофе?", "Видел твою встречу, можно с вами?", "Привет 👋"];
  const headImg = eventTitle !== null ? eventPhotoUrl : soleMember?.avatarUrl ?? null;
  const headSub =
    eventTitle !== null
      ? `${totalParticipantsCount} ${pluralizePeople(totalParticipantsCount)}${eventMeta?.date ? ` · ${formatDayLabel(eventMeta.date)}${eventMeta.time ? `, ${eventMeta.time.slice(0, 5)}` : ""}` : ""}`
      : "личная переписка";

  return (
    <div className="P" style={{ height: liveHeight ? `${liveHeight}px` : undefined }}>
      <section className="scr chat aurora in" data-id="chat">
        <div className="hd">
          <button className="rb gl" onClick={() => goBack(router, "/chats")} aria-label="Назад" style={{ width: 40, height: 40 }}>
            <Ic n="back" />
          </button>
          {headImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={eventTitle === null ? "r" : ""} src={photoThumb(headImg, 84)} alt="" />
          ) : (
            <span className={`hav ${eventTitle === null ? "r" : "gfx"}`}>
              {eventTitle === null ? (
                (soleMember?.name ?? "?").charAt(0).toUpperCase()
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={categoryIcon ?? "/brand/cat3d/i_games.webp"} alt="" />
              )}
            </span>
          )}
          <div>
            <b>{headerTitle}</b>
            <span>{isEventClosed ? "Событие закрыто" : headSub}</span>
          </div>
          {eventTitle !== null && eventMeta ? (
            <button className="rb gl" onClick={() => router.push(`/events/${eventMeta.id}`)} aria-label="О встрече" style={{ width: 40, height: 40 }}>
              <Ic n="cal" c="s" />
            </button>
          ) : soleMember ? (
            <button className="rb gl" onClick={() => router.push(`/people/${soleMember.id}`)} aria-label="Профиль" style={{ width: 40, height: 40 }}>
              <Ic n="user" c="s" />
            </button>
          ) : null}
        </div>

        <div
          className="msgs"
          ref={listRef}
          onScroll={handleScroll}
          onPointerDown={interruptScroll}
          onWheel={interruptScroll}
          role="region"
          aria-label="Сообщения"
          tabIndex={0}
        >
          <div className="msgsin" ref={contentRef}>
          {hasMore && (
            <button className="history-more" onClick={() => void loadOlder()} disabled={loadingOlder}>
              {loadingOlder ? "Загружаем ранние сообщения…" : "Загрузить предыдущие сообщения"}
            </button>
          )}
          {eventTitle !== null && eventMeta && (
            <>
              <div className="evpin gl">
                {eventPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoThumb(eventPhotoUrl, 88)} alt="" />
                ) : (
                  <span className="hav gfx" style={{ width: 44, height: 44, borderRadius: 12 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={categoryIcon ?? "/brand/cat3d/i_games.webp"} alt="" />
                  </span>
                )}
                <div>
                  <b>
                    {eventMeta.date ? formatDayLabel(eventMeta.date) : ""}
                    {eventMeta.time ? `, ${eventMeta.time.slice(0, 5)}` : ""}
                  </b>
                  <span>{[eventMeta.place, eventMeta.address].filter(Boolean).join(", ")}</span>
                </div>
              </div>
              {members.length > 0 && !isEventClosed && (
                <button className="plq gl" onClick={openParticipants}>
                  <span className="faces">
                    {members.slice(0, 3).map((m) =>
                      m.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={m.id} src={photoThumb(m.avatarUrl, 56)} alt="" />
                      ) : (
                        <span key={m.id}>{m.name.charAt(0).toUpperCase()}</span>
                      )
                    )}
                  </span>
                  <div>
                    <b>
                      Уже идут {totalParticipantsCount} {pluralizePeople(totalParticipantsCount)}
                    </b>
                    <span>Нажми, чтобы посмотреть участников</span>
                  </div>
                </button>
              )}
            </>
          )}
          {eventTitle === null && <span className="daysep">Личная переписка</span>}
          {loading && [0, 1, 2].map((i) => <div key={i} className="sk" style={{ height: 44, width: i % 2 ? "60%" : "50%", alignSelf: i % 2 ? "flex-end" : "flex-start" }} />)}
          {error && <span className="daysep">{error}</span>}
          {!loading && messages.length === 0 && !error && (
            <div className="empty" style={{ padding: "30px 0" }}>
              <EmptyIll a={["blob", "pink", "smile"]} b={["flower", "sky", "wow"]} c={["star", "peach", "calm"]} />
              <span>{eventTitle === null ? "Начни с приветствия или сразу позови на встречу" : "Напиши первым — поздоровайся с компанией"}</span>
            </div>
          )}
          {messages.map((message, index) => {
            const prev = messages[index - 1];
            const readers = members.filter((m) => m.lastReadAt && message.createdAt <= m.lastReadAt);
            const isGroup = members.length > 1;
            const isLastOwn = message.senderId === myUserId && !messages.slice(index + 1).some((m) => m.senderId === myUserId);
            const showDaySeparator = !prev || !isSameDay(prev.createdAt, message.createdAt);
            const isOwn = message.senderId === myUserId;
            const readStatus: "sent" | "partial" | "read" =
              members.length > 0 && readers.length === members.length ? "read" : readers.length > 0 ? "partial" : "sent";
            const readCaption =
              isGroup && isLastOwn && !message.id.startsWith("temp-")
                ? readers.length === members.length
                  ? "Прочитали все"
                  : readers.length === 0
                    ? "Ещё никто не прочитал"
                    : `Прочитали: ${readers.slice(0, 3).map((m) => m.name).join(", ")}${readers.length > 3 ? ` и ещё ${readers.length - 3}` : ""}`
                : null;
            const sender = members.find((m) => m.id === message.senderId);
            const showSender = !isOwn && isGroup && (!prev || prev.senderId !== message.senderId || showDaySeparator);
            return (
              <div key={message.id} id={`m-${message.id}`} className="mwrap" data-message-id={message.id}>
                {showDaySeparator && <span className="daysep">{formatDayLabel(message.createdAt)}</span>}
                <MessageBubble
                  message={message}
                  isOwn={isOwn}
                  sender={sender ? { name: sender.name, avatarUrl: sender.avatarUrl } : null}
                  showSender={showSender}
                  onSenderPress={sender && !sender.anonymous ? () => setShowMiniProfileFor(sender.id) : undefined}
                  readStatus={readStatus}
                  readCaption={readCaption}
                  onOwnPress={isOwn && isGroup && !message.id.startsWith("temp-") ? () => setReadersFor(message) : undefined}
                  onMenu={!message.id.startsWith("temp-") ? () => setMenuFor(message) : undefined}
                  onReact={(emoji) => toggleReaction(message, emoji)}
                  replyName={message.replyTo ? nameOf(message.replyTo.senderId) : undefined}
                  onReplyPress={message.replyTo ? () => jumpTo(message.replyTo!.id) : undefined}
                  onRetry={() => retryMessage(message)}
                  highlighted={highlightId === message.id}
                  animate={!quietIdsRef.current.has(message.id)}
                />
              </div>
            );
          })}
          </div>
        </div>

        {!atBottom && (
          <button
            className="tobot gl"
            style={{ bottom: composeH + 12 }}
            onClick={() => scrollToBottom(true)}
            aria-label="К последним сообщениям"
          >
            {unseen > 0 && <span className="cnt">{unseen > 99 ? "99+" : unseen}</span>}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        )}

        <div className="compose" ref={composeRef}>
          {isEventClosed ? (
            <p className="muted" style={{ textAlign: "center", fontSize: 14, padding: "6px 0" }}>
              Событие закрыто — отправка новых сообщений недоступна.
            </p>
          ) : (
            <>
              {(replyTo || editing) && (
                <div className="rbar gl">
                  <Ic n={editing ? "edit" : "chat"} c="s" />
                  <div>
                    <b>{editing ? "Изменить сообщение" : `Ответ: ${nameOf(replyTo!.senderId)}`}</b>
                    <span>{quoteText((editing ?? replyTo)!)}</span>
                  </div>
                  <button
                    className="rb gl"
                    style={{ width: 30, height: 30 }}
                    onClick={() => {
                      if (editing) setDraft("");
                      setEditing(null);
                      setReplyTo(null);
                    }}
                    aria-label="Отменить"
                  >
                    <Ic n="close" c="xs" />
                  </button>
                </div>
              )}
              {replyTo || editing ? null : pendingImage ? (
                <div className="plq gl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pendingImage} alt="Выбранное фото" style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover" }} />
                  <div>
                    <b>Фото готово</b>
                    <span>Добавь подпись или сразу отправь</span>
                  </div>
                  <button className="rb gl" style={{ width: 34, height: 34 }} onClick={() => setPendingImage(null)} aria-label="Убрать фото">
                    <Ic n="close" c="xs" />
                  </button>
                </div>
              ) : (
                <div className="quick">
                  {quick.map((q) => (
                    <button key={q} onClick={() => setDraft(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
              <div className="inrow">
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePickImage} />
                <label className="field gl">
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={preparingImage || !!editing} aria-label="Прикрепить фото" style={{ color: "var(--grey)", display: "grid", alignSelf: "flex-end", marginBottom: 13 }}>
                    <Ic n="camera" c="s" />
                  </button>
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      // Компьютер: Enter — отправить, Shift+Enter — новая строка. Телефон: Enter — новая строка.
                      const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
                      if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={pendingImage ? "Подпись к фото…" : "Сообщение"}
                    style={{ resize: "none", lineHeight: "20px", padding: "13px 0", maxHeight: 120, overflowY: "auto", background: "transparent", border: 0, outline: "none", flex: 1, font: "inherit", fontSize: 16, color: "inherit", minWidth: 0, width: "100%" }}
                  />
                  {!editing && (
                    <button type="button" className="stkbtn" onClick={() => setStickersOpen(true)} aria-label="Стикеры" style={{ alignSelf: "flex-end", marginBottom: 7 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/brand/stickers/mosya_wave.webp" alt="" />
                    </button>
                  )}
                </label>
                <button
                  className="send"
                  // Не забираем фокус у поля — клавиатура не закрывается после отправки (как в Telegram).
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSend} disabled={(!!editing && sending) || (!draft.trim() && !pendingImage)} aria-label={editing ? "Сохранить" : "Отправить"}>
                  <Ic n={editing ? "check" : "send"} />
                </button>
              </div>
            </>
          )}
        </div>

        {menuFor && (
          // Как в Telegram: фон размывается, сверху — реакции Моси, под ними само сообщение и действия.
          <div className={`mpop ${menuFor.senderId === myUserId ? "me" : ""}`} onClick={() => setMenuFor(null)}>
            <div className="mpopin" onClick={(e) => e.stopPropagation()}>
              {!isEventClosed && (
                <div className="rxrow">
                  {REACTIONS.map((r) => (
                    <button
                      key={r}
                      className={(menuFor.reactions ?? []).some((x) => x.emoji === r && x.mine) ? "on" : ""}
                      onClick={() => {
                        const m = menuFor;
                        setMenuFor(null);
                        toggleReaction(m, r);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={stickerSrc(r)} alt="" />
                    </button>
                  ))}
                </div>
              )}
              <div className="mpopmsg">
                <MessageBubble message={menuFor} isOwn={menuFor.senderId === myUserId} sender={null} showSender={false} readStatus="sent" />
              </div>
              <div className="mmenu">
                {!isEventClosed && (
                  <button
                    onClick={() => {
                      setReplyTo(menuFor);
                      setEditing(null);
                      setMenuFor(null);
                      setTimeout(() => inputRef.current?.focus(), 350);
                    }}
                  >
                    <Ic n="chat" c="s" />
                    Ответить
                  </button>
                )}
                {menuFor.content && !parseSticker(menuFor.content) && !parseInvite(menuFor.content) && (
                  <button
                    onClick={() => {
                      const t = menuFor.content;
                      setMenuFor(null);
                      navigator.clipboard?.writeText(t).then(() => showToast("Скопировано"), () => showToast("Не удалось скопировать"));
                    }}
                  >
                    <Ic n="copy" c="s" />
                    Скопировать
                  </button>
                )}
                {menuFor.senderId === myUserId &&
                  !isEventClosed &&
                  menuFor.content &&
                  !parseSticker(menuFor.content) &&
                  !parseInvite(menuFor.content) &&
                  Date.now() - Date.parse(menuFor.createdAt) < EDIT_WINDOW_MS && (
                    <button
                      onClick={() => {
                        setEditing(menuFor);
                        setReplyTo(null);
                        setDraft(menuFor.content);
                        setMenuFor(null);
                        setTimeout(() => inputRef.current?.focus(), 350);
                      }}
                    >
                      <Ic n="edit" c="s" />
                      Изменить
                    </button>
                  )}
                {menuFor.senderId === myUserId && members.length > 1 && (
                  <button
                    onClick={() => {
                      setReadersFor(menuFor);
                      setMenuFor(null);
                    }}
                  >
                    <Ic n="eye" c="s" />
                    Кто прочитал
                  </button>
                )}
                {menuFor.senderId === myUserId && (
                  <button
                    className="del"
                    onClick={() => {
                      setDeleteFor(menuFor);
                      setMenuFor(null);
                    }}
                  >
                    <Ic n="close" c="s" />
                    Удалить
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <Sheet open={!!deleteFor} onClose={() => setDeleteFor(null)}>
          <h2 className="t">Удалить сообщение?</h2>
          <p className="muted" style={{ margin: "-6px 0 0", fontSize: 14 }}>
            Оно исчезнет у всех участников чата.
          </p>
          <button className="btn v" style={{ width: "100%", background: "#e5484d" }} onClick={() => deleteFor && deleteMessage(deleteFor)}>
            Удалить
          </button>
          <button className="btn o" style={{ width: "100%" }} onClick={() => setDeleteFor(null)}>
            Отмена
          </button>
        </Sheet>

        <Sheet open={stickersOpen} onClose={() => setStickersOpen(false)}>
          <div className="chs">
            <button className={stickerTab === "mosya" ? "on" : "gl"} onClick={() => setStickerTab("mosya")}>
              Мося
            </button>
            <button className={stickerTab === "interests" ? "on" : "gl"} onClick={() => setStickerTab("interests")}>
              Интересы
            </button>
          </div>
          <div className="stkgrid">
            {(stickerTab === "mosya" ? MOSYA_STICKERS : INTEREST_STICKERS.map((x) => [x, ""] as [string, string])).map(([slug, label]) => (
              <button key={slug} onClick={() => sendSticker(slug)} aria-label={label || "Стикер"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={stickerSrc(slug)} alt="" loading="lazy" />
                {label && <span>{label}</span>}
              </button>
            ))}
          </div>
        </Sheet>

        {toast && <div className="ctoast gl">{toast}</div>}

        {showMiniProfileFor && <MiniProfileSheet userId={showMiniProfileFor} onClose={() => setShowMiniProfileFor(null)} />}

        <Sheet open={!!readersFor} onClose={() => setReadersFor(null)}>
          <h2 className="t">Кто прочитал</h2>
          <p className="muted" style={{ margin: "-6px 0 0", fontSize: 14 }}>
            {readersFor?.content || "Фото"}
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {readersFor &&
              members.map((m) => {
                const isRead = !!(m.lastReadAt && readersFor.createdAt <= m.lastReadAt);
                return (
                  <div key={m.id} className="apl gl">
                    {m.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoThumb(m.avatarUrl, 88)} alt="" />
                    ) : (
                      <span className="hav r" style={{ width: 44, height: 44 }}>
                        {m.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div>
                      <b>{m.name}</b>
                      <span>{isRead ? "прочитал(а)" : "ещё не прочитал(а)"}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </Sheet>

        <Sheet open={showParticipants} onClose={() => setShowParticipants(false)}>
          <h2 className="t">
            Участники <em>встречи</em>
          </h2>
          <div className="chs">
            {(
              [
                ["all", "Все"],
                ["organizer", "Организатор"],
                ["participants", "Участники"],
              ] as [ParticipantsTab, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                className={participantsTab === value ? "on" : "gl"}
                onClick={() => {
                  setParticipantsTab(value);
                  setParticipantsExpanded(false);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {participantsToShow.map((m) => (
              <button
                key={m.id}
                className="apl gl"
                style={{ width: "100%", textAlign: "left" }}
                onClick={() => {
                  if (m.anonymous) return;
                  setShowParticipants(false);
                  setShowMiniProfileFor(m.id);
                }}
              >
                {m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoThumb(m.avatarUrl, 88)} alt="" />
                ) : (
                  <span className="hav r" style={{ width: 44, height: 44 }}>
                    {m.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div>
                  <b>
                    {m.name}
                    {m.age ? `, ${m.age}` : ""}
                  </b>
                  <span>
                    {m.id === organizerId ? "Организатор" : "Участник"}
                    {m.completedMeetingsCount > 0 && ` · ${isFemale(m.gender) ? "была" : "был"} на ${m.completedMeetingsCount} ${pluralizeMeetings(m.completedMeetingsCount)}`}
                  </span>
                </div>
                <Ic n="chev" c="s" />
              </button>
            ))}
          </div>
          {hiddenParticipantsCount > 0 && (
            <button className="btn o" onClick={() => setParticipantsExpanded(true)}>
              Показать ещё {hiddenParticipantsCount} {pluralizeParticipants(hiddenParticipantsCount)}
            </button>
          )}
        </Sheet>
      </section>
    </div>
  );
}

function pluralizePeople(n: number): string {
  const m = n % 10;
  const h = n % 100;
  return m >= 2 && m <= 4 && (h < 10 || h >= 20) ? "человека" : "человек";
}

function isSameDay(isoA: string, isoB: string): boolean {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Значение поля пола в базе не проверено мной напрямую (нет доступа к
// миграциям прямо сейчас) — подстраховываюсь несколькими часто
// встречающимися вариантами написания. Если "был/была" перепутается —
// пришли точное значение из БД (select distinct gender from users), поправлю.
function isFemale(gender: string | null): boolean {
  if (!gender) return false;
  return ["female", "f", "ж", "woman"].includes(gender.toLowerCase());
}

function pluralizeMeetings(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "встрече";
  return "встречах";
}

function pluralizeParticipants(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "участника";
  if ([2, 3, 4].includes(mod10) && !(mod100 >= 12 && mod100 <= 14)) return "участников";
  return "участников";
}

/**
 * Ужимает фото на телефоне перед отправкой: длинная сторона до 1600 px,
 * JPEG 82% — обычно 200–500 КБ вместо 3–8 МБ с камеры. Заодно убирает
 * EXIF (геолокацию и т.п.) — перерисовка через canvas его не сохраняет.
 */
async function compressImage(file: File): Promise<string> {
  const MAX_SIDE = 1600;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode_failed"));
      el.src = objectUrl;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no_canvas");
    ctx.fillStyle = "#ffffff"; // прозрачный PNG → белый фон, а не чёрный
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Реакции — 6 анимированных Моси (как в мобильном приложении). В БД хранится slug. */
const REACTIONS = ["mosya_love", "mosya_lol", "mosya_clap", "mosya_wow", "mosya_sad", "mosya_angry"];

/** Стикеры Моси для панели (порядок = порядок в панели). */
const MOSYA_STICKERS: [string, string][] = [
  ["mosya_wave", "Привет!"], ["mosya_stand", "Я на месте"], ["mosya_run", "Бегу!"], ["mosya_late", "Опаздываю"],
  ["mosya_coffee", "На кофе?"], ["mosya_jump", "Ура!"], ["mosya_lol", "Ха-ха"], ["mosya_love", "Люблю"],
  ["mosya_shy", "Стесняюсь"], ["mosya_clap", "Браво"], ["mosya_wow", "Ого!"], ["mosya_think", "Хм…"],
  ["mosya_facepalm", "Ну как так"], ["mosya_sad", "Грущу"], ["mosya_angry", "Злюсь"], ["mosya_cool", "Крутой"],
  ["mosya_glasses", "Умник"], ["mosya_phone", "На связи"], ["mosya_selfie", "Селфи"], ["mosya_sit", "Жду"],
  ["mosya_sleep", "Сплю"], ["mosya_party", "Праздник"], ["mosya_bday", "С днём рождения"], ["mosya_gift", "Подарок"],
  ["mosya_music", "Кайфую"], ["mosya_gym", "Качаюсь"], ["mosya_sport", "Спорт"], ["mosya_travel", "В путь"],
  ["mosya_winter", "Холодно"], ["mosya_rich", "Богач"], ["mosya_gold", "Король"], ["mosya_pin", "Наше место"],
];
const INTEREST_STICKERS = [
  "kofe", "zavtrak", "uzhin", "pizza", "bar", "party", "karaoke", "concert", "music", "guitar",
  "kino", "theatre", "art", "photo", "books", "lang", "games", "biz", "cook", "banya",
  "run", "gym", "yoga", "bike", "football", "tennis", "swim", "box", "ski", "roller",
  "hike", "camp", "trip", "travel", "world", "dogs",
].map((x) => `i_${x}`);

const EDIT_WINDOW_MS = 48 * 3600_000;

function shapeReactions(list: { emoji: string; userIds: string[] }[] | undefined, meId: string | null): MessageReaction[] {
  return (list ?? [])
    .filter((r) => r.userIds.length > 0)
    .map((r) => ({ emoji: r.emoji, userIds: r.userIds, count: r.userIds.length, mine: !!meId && r.userIds.includes(meId) }));
}

/** Сообщение с сервера/канала → единый вид (старые ответы API без новых полей тоже ок). */
function normMessage(m: MessageData): MessageData {
  return { ...m, imageUrl: m.imageUrl ?? null, editedAt: m.editedAt ?? null, deleted: !!m.deleted, replyTo: m.replyTo ?? null, reactions: m.reactions ?? [] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
