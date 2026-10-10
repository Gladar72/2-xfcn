"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/brand/Icon";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { MessageBubble, formatDayLabel, type MessageData } from "@/components/chat/MessageBubble";
import { MiniProfileSheet } from "@/components/chat/MiniProfileSheet";
import { CATEGORY_ICON } from "@/lib/data/category-icons";
import { createBrowserRealtimeClient } from "@/lib/supabase/browser-realtime";
import { useTelegramViewportHeight } from "@/lib/telegram/webapp-client";
import { useVisualViewportHeight } from "@/lib/hooks/use-visual-viewport-height";
import { useLockBodyScroll } from "@/lib/hooks/use-lock-body-scroll";
import { photoThumb } from "@/lib/photos/thumb";

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
}

type ParticipantsTab = "all" | "organizer" | "participants";

const PARTICIPANTS_PAGE_SIZE = 7;

export default function ChatPage({ params }: ChatPageProps) {
  const { id: conversationId } = params;
  const router = useRouter();
  useLockBodyScroll();

  const visualViewportHeight = useVisualViewportHeight();
  const telegramViewportHeight = useTelegramViewportHeight();
  const liveHeight = visualViewportHeight ?? telegramViewportHeight;

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [eventStatus, setEventStatus] = useState<string | null>(null);
  const [category, setCategory] = useState<{ slug: string; name: string; emoji: string | null } | null>(null);
  const [isBusiness, setIsBusiness] = useState(false);
  const [organizerId, setOrganizerId] = useState<string | null>(null);
  const [eventPhotoUrl, setEventPhotoUrl] = useState<string | null>(null);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessBlocked, setAccessBlocked] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
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
        setMessages(history.messages ?? []);
        setEventTitle(history.eventTitle ?? null);
        setEventStatus(history.eventStatus ?? null);
        setCategory(history.category ?? null);
        setIsBusiness(history.isBusiness ?? false);
        setOrganizerId(history.organizerId ?? null);
        setEventPhotoUrl(history.eventPhotoUrl ?? null);
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
            const row = payload as {
              id: string;
              senderId: string;
              content: string;
              imageUrl?: string | null;
              createdAt: string;
            };
            if (!row?.id) return;
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              const incoming: MessageData = {
                id: row.id,
                senderId: row.senderId,
                content: row.content,
                imageUrl: row.imageUrl ?? null,
                createdAt: row.createdAt,
              };
              // Своё сообщение может прийти по каналу раньше ответа POST —
              // тогда заменяем им временную копию, а не дублируем.
              const tempIndex = prev.findIndex(
                (m) =>
                  m.id.startsWith("temp-") &&
                  m.senderId === row.senderId &&
                  m.content === row.content &&
                  !!m.imageUrl === !!row.imageUrl
              );
              if (tempIndex !== -1) return prev.map((m, i) => (i === tempIndex ? incoming : m));
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

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, liveHeight]);

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

  async function handleSend() {
    const content = draft.trim();
    const image = pendingImage;
    if ((!content && !image) || sending || !myUserId || isEventClosed) return;

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        senderId: myUserId,
        content,
        imageUrl: image,
        uploading: !!image,
        createdAt: new Date().toISOString(),
      },
    ]);
    setSending(true);
    setDraft("");
    setPendingImage(null);
    const restore = () => {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(content);
      setPendingImage(image);
    };
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(image ? { content, image } : { content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "photo_rejected"
            ? "Фото не прошло проверку и не может быть отправлено."
            : data.error === "photo_too_large"
              ? "Фото слишком большое."
              : data.error === "photo_invalid"
                ? "Этот формат фото не поддерживается."
                : "Не получилось отправить сообщение."
        );
        restore();
        return;
      }
      if (data.messageId && data.createdAt) {
        setMessages((prev) =>
          prev.some((m) => m.id === data.messageId)
            ? prev.filter((m) => m.id !== tempId)
            : prev.map((m) =>
                m.id === tempId
                  ? {
                      ...m,
                      id: data.messageId,
                      createdAt: data.createdAt,
                      imageUrl: data.imageUrl ?? m.imageUrl,
                      uploading: false,
                    }
                  : m
              )
        );
      }
    } catch {
      setError("Проблема с соединением.");
      restore();
    } finally {
      setSending(false);
    }
  }

  function openParticipants() {
    setParticipantsTab("all");
    setParticipantsExpanded(false);
    setShowParticipants(true);
  }

  const isEventClosed = eventStatus === "completed" || eventStatus === "cancelled";
  const headerTitle = eventTitle ?? (members.length === 1 ? (members[0]?.name ?? "Чат") : "Чат");
  const soleMember = members.length === 1 ? members[0] : null;
  const categoryIcon = isBusiness ? "/brand/markers/marker-business.png" : category ? CATEGORY_ICON[category.slug] : undefined;
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-title text-ink-900">Чат недоступен</p>
        <p className="text-sm text-ink-600">Событие уже прошло или было отменено.</p>
        <button
          onClick={() => router.push("/chats")}
          className="mt-2 rounded-pill bg-brand-gradient px-6 py-3 text-sm font-semibold text-white shadow-cta m-btn-v relative overflow-hidden"
        >
          Назад к чатам
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 flex flex-col overflow-hidden"
      style={{ height: liveHeight ? `${liveHeight}px` : "100dvh" }}
    >
      <div className={`flex shrink-0 items-center gap-3 border-b border-lavender-100 bg-white px-4 py-3 ${isEventClosed ? "opacity-60" : ""}`}>
        <button onClick={() => router.push("/chats")} aria-label="Назад" className="m-glass m-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
          <Icon name="back" size={22} className="" />
        </button>
        <button
          onClick={() => (soleMember ? setShowMiniProfileFor(soleMember.id) : openParticipants())}
          className="flex min-w-0 flex-1 items-center gap-3"
          disabled={members.length === 0}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-xs font-semibold text-ink-600">
            {eventPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoThumb(eventPhotoUrl, 48)} alt="" className="h-full w-full object-cover" />
            ) : categoryIcon ? (
              <Image src={categoryIcon} alt="" width={20} height={20} className="object-contain" />
            ) : category?.emoji ? (
              <span className="text-sm">{category.emoji}</span>
            ) : soleMember ? (
              soleMember.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoThumb(soleMember.avatarUrl, 48)} alt="" className="h-full w-full object-cover" />
              ) : (
                soleMember.name.charAt(0).toUpperCase()
              )
            ) : (
              <Icon name="people" size={20} className="text-accent" />
            )}
          </div>
          <span className="truncate font-medium">{headerTitle}</span>
          {isEventClosed && <span className="shrink-0 text-xs text-ink-400">Событие закрыто</span>}
        </button>
      </div>

      {/* Закреплённая плашка с аватарками участников — по референсу
          пользователя. Только для группового чата встречи (не для
          обычного диалога один на один) и пока событие не закрыто. */}
      {/* Раньше показывалась только для групп (>1 участника кроме себя) —
          по явному уточнению пользователя, теперь всегда, если в чате
          вообще есть хоть один участник кроме себя. */}
      {members.length > 0 && !isEventClosed && (
        <button
          onClick={openParticipants}
          className="mx-4 mt-3 flex shrink-0 items-center gap-3 rounded-card m-glass p-3 text-left"
        >
          <div className="flex shrink-0 -space-x-2">
            {members.slice(0, 3).map((m) => (
              <div
                key={m.id}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-lavender-100 text-xs font-semibold text-ink-600"
              >
                {m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoThumb(m.avatarUrl, 48)} alt="" className="h-full w-full object-cover" />
                ) : (
                  m.name.charAt(0).toUpperCase()
                )}
              </div>
            ))}
            {totalParticipantsCount > 4 && (
              <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-lavender-100 text-xs font-semibold text-accent">
                +{totalParticipantsCount - 3}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink-900">Уже идут {totalParticipantsCount} человек</p>
            <p className="text-xs text-ink-600">Нажми, чтобы посмотреть участников</p>
          </div>
          <span className="shrink-0 text-ink-400">›</span>
        </button>
      )}

      {showMiniProfileFor && (
        <MiniProfileSheet userId={showMiniProfileFor} onClose={() => setShowMiniProfileFor(null)} />
      )}

      {readersFor && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-[rgba(22,18,31,0.35)] m-fade-in" onClick={() => setReadersFor(null)}>
          <div
            className="max-h-[70vh] overflow-y-auto rounded-t-sheet bg-white p-5 pb-8 m-sheet-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <h2 className="text-title mb-1 text-center">Кто прочитал</h2>
            <p className="mb-4 line-clamp-2 text-center text-sm text-ink-600">
              {readersFor.content || "Фото"}
            </p>
            {(() => {
              const read = members.filter((m) => m.lastReadAt && readersFor.createdAt <= m.lastReadAt);
              const unread = members.filter((m) => !(m.lastReadAt && readersFor.createdAt <= m.lastReadAt));
              const row = (m: Member, isRead: boolean) => (
                <div key={m.id} className="flex items-center gap-3 py-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-background text-sm font-semibold text-ink-600">
                    {m.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoThumb(m.avatarUrl, 36)} alt={m.name} className="h-full w-full object-cover" />
                    ) : (
                      m.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="flex-1 text-sm font-medium text-ink-900">{m.name}</span>
                  <span className={isRead ? "text-xs font-medium text-accent" : "text-xs text-ink-400"}>
                    {isRead ? "прочитал(а)" : "не прочитал(а)"}
                  </span>
                </div>
              );
              return (
                <>
                  {read.length > 0 && (
                    <>
                      <p className="mb-1 text-xs font-semibold uppercase text-ink-400">Прочитали · {read.length}</p>
                      {read.map((m) => row(m, true))}
                    </>
                  )}
                  {unread.length > 0 && (
                    <>
                      <p className="mb-1 mt-3 text-xs font-semibold uppercase text-ink-400">Ещё не прочитали · {unread.length}</p>
                      {unread.map((m) => row(m, false))}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {showParticipants && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-[rgba(22,18,31,0.35)] m-fade-in" onClick={() => setShowParticipants(false)}>
          <div
            className="max-h-[80vh] overflow-y-auto rounded-t-sheet bg-white p-5 pb-8 m-sheet-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <h2 className="text-title mb-1 text-center">Участники события</h2>
            <p className="mb-4 text-center text-sm text-ink-600">{totalParticipantsCount} человек</p>

            <div className="mb-4 flex justify-center gap-2">
              {(
                [
                  ["all", "Все"],
                  ["organizer", "Организатор"],
                  ["participants", "Участники"],
                ] as [ParticipantsTab, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    setParticipantsTab(value);
                    setParticipantsExpanded(false);
                  }}
                  className={`rounded-pill px-4 py-1.5 text-sm font-medium ${
                    participantsTab === value ? "bg-brand-gradient text-white" : "bg-lavender-100 text-ink-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              {participantsToShow.map((m) => {
                const isOrganizer = m.id === organizerId;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setShowParticipants(false);
                      setShowMiniProfileFor(m.id);
                    }}
                    className="flex w-full items-center gap-3 rounded-card p-2 text-left hover:bg-lavender-50"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-sm font-semibold text-ink-600">
                      {m.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoThumb(m.avatarUrl, 48)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        m.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink-900">
                        {m.name}
                        {m.age ? `, ${m.age}` : ""}
                      </p>
                      <p className="text-xs text-ink-600">
                        {isOrganizer ? "Организатор" : "Участник"}
                        {m.completedMeetingsCount > 0 &&
                          ` • ${isFemale(m.gender) ? "была" : "был"} на ${m.completedMeetingsCount} ${pluralizeMeetings(m.completedMeetingsCount)}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-ink-400">›</span>
                  </button>
                );
              })}
            </div>

            {hiddenParticipantsCount > 0 && (
              <button
                onClick={() => setParticipantsExpanded(true)}
                className="mt-2 w-full py-2 text-center text-sm font-medium text-accent"
              >
                Показать ещё {hiddenParticipantsCount} {pluralizeParticipants(hiddenParticipantsCount)} ⌄
              </button>
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {loading && <p className="text-center text-ink-600">Загрузка...</p>}
        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {messages.map((message, index) => {
          const prev = messages[index - 1];
          const readers = members.filter((m) => m.lastReadAt && message.createdAt <= m.lastReadAt);
          const isGroup = members.length > 1;
          // Подпись «кто прочитал» — только под последним своим сообщением в групповом чате.
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
          const showSenderLabel = !isOwn && (!prev || prev.senderId !== message.senderId || showDaySeparator);

          return (
            <div key={message.id}>
              {showDaySeparator && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-pill bg-lavender-100 px-3 py-1 text-caption font-medium text-ink-600">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
              )}
              {showSenderLabel && (
                <p className="mb-1 ml-1 text-xs font-medium text-ink-600">{sender?.name ?? "Участник"}</p>
              )}
              <MessageBubble
                message={message}
                isOwn={isOwn}
                readStatus={readStatus}
                readCaption={readCaption}
                onOwnPress={isOwn && isGroup && !message.id.startsWith("temp-") ? () => setReadersFor(message) : undefined}
              />
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      {pendingImage && !isEventClosed && (
        <div className="flex shrink-0 items-center gap-3 border-t border-lavender-100 bg-white px-3 pt-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pendingImage} alt="Выбранное фото" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs leading-none text-white"
              aria-label="Убрать фото"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-ink-600">Добавьте подпись или сразу отправьте</p>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 border-t border-lavender-100 bg-white p-3">
        {isEventClosed ? (
          <p className="w-full text-center text-sm text-ink-400">
            Событие закрыто — отправка новых сообщений недоступна.
          </p>
        ) : (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePickImage}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || preparingImage}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lavender-100 disabled:opacity-40"
              aria-label="Прикрепить фото"
            >
              {preparingImage ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              ) : (
                <Icon name="plus" size={22} />
              )}
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              placeholder={pendingImage ? "Подпись к фото..." : "Написать сообщение..."}
              className="min-w-0 flex-1 rounded-pill border border-lavender-200 bg-background px-4 py-2.5 text-base outline-none focus:border-accent"
            />
            <button
              onClick={handleSend}
              disabled={sending || (!draft.trim() && !pendingImage)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient disabled:opacity-40"
              aria-label="Отправить"
            >
              <Icon name="send" size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  );
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
