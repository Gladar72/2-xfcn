"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { MessageBubble, formatDayLabel, type MessageData } from "@/components/chat/MessageBubble";
import { MiniProfileSheet } from "@/components/chat/MiniProfileSheet";
import { CATEGORY_ICON } from "@/lib/data/category-icons";
import { createBrowserRealtimeClient } from "@/lib/supabase/browser-realtime";
import { useTelegramViewportHeight } from "@/lib/telegram/webapp-client";
import { useVisualViewportHeight } from "@/lib/hooks/use-visual-viewport-height";
import { useLockBodyScroll } from "@/lib/hooks/use-lock-body-scroll";
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

        <div className="msgs">
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
              <div key={message.id} style={{ display: "contents" }}>
                {showDaySeparator && <span className="daysep">{formatDayLabel(message.createdAt)}</span>}
                <MessageBubble
                  message={message}
                  isOwn={isOwn}
                  sender={sender ? { name: sender.name, avatarUrl: sender.avatarUrl } : null}
                  showSender={showSender}
                  onSenderPress={sender ? () => setShowMiniProfileFor(sender.id) : undefined}
                  readStatus={readStatus}
                  readCaption={readCaption}
                  onOwnPress={isOwn && isGroup && !message.id.startsWith("temp-") ? () => setReadersFor(message) : undefined}
                />
              </div>
            );
          })}
          <div ref={scrollRef} />
        </div>

        <div className="compose">
          {isEventClosed ? (
            <p className="muted" style={{ textAlign: "center", fontSize: 14, padding: "6px 0" }}>
              Событие закрыто — отправка новых сообщений недоступна.
            </p>
          ) : (
            <>
              {pendingImage ? (
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
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending || preparingImage} aria-label="Прикрепить фото" style={{ color: "var(--grey)", display: "grid" }}>
                    <Ic n="camera" c="s" />
                  </button>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSend();
                    }}
                    placeholder={pendingImage ? "Подпись к фото…" : "Сообщение"}
                  />
                </label>
                <button className="send" onClick={handleSend} disabled={sending || (!draft.trim() && !pendingImage)} aria-label="Отправить">
                  <Ic n="send" />
                </button>
              </div>
            </>
          )}
        </div>

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
