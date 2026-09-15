mkdir -p "app/api/conversations/[id]/messages"
cat > "app/api/conversations/[id]/messages/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

const MESSAGE_HISTORY_LIMIT = 50;

async function assertMembership(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  userId: string
) {
  const { data } = await admin
    .from("conversation_members")
    .select("id, is_blocked")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/**
 * GET /api/conversations/[id]/messages
 * История сообщений (последние 50, по возрастанию времени) + имя
 * собеседника (для шапки чата и подписи над входящими сообщениями —
 * иначе непонятно "кто кому пишет", особенно когда все сообщения на вид
 * одинаковые).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const membership = await assertMembership(admin, conversationId, currentUser.userId);
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [{ data: messages, error }, { data: otherMemberRow }] = await Promise.all([
    admin
      .from("messages")
      .select("id, sender_id, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_HISTORY_LIMIT),
    // Имя и last_read_at собеседника одним запросом: имя — для шапки чата и
    // подписи над входящими сообщениями, last_read_at — для галочек
    // "доставлено"/"прочитано" (сообщение считается прочитанным, если оно
    // старше last_read_at собеседника).
    admin
      .from("conversation_members")
      .select("last_read_at, user:users(id, name, avatar_url)")
      .eq("conversation_id", conversationId)
      .neq("user_id", currentUser.userId)
      .maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const otherUser = otherMemberRow?.user as unknown as
    | { id: string; name: string; avatar_url: string | null }
    | null;

  return NextResponse.json({
    // ВАЖНО: преобразуем snake_case из базы (sender_id, created_at) в
    // camelCase (senderId, createdAt), который ждёт фронтенд — раньше эта
    // строка отдавала сырые строки БД напрямую, из-за чего даты не
    // парсились ("Invalid Date") и определение "моё/чужое" сообщение
    // всегда давало false (senderId был undefined) — все сообщения
    // выглядели одинаково.
    messages: (messages ?? [])
      .reverse()
      .map((m) => ({ id: m.id, senderId: m.sender_id, content: m.content, createdAt: m.created_at })),
    otherMemberLastReadAt: otherMemberRow?.last_read_at ?? null,
    otherUser: otherUser ? { id: otherUser.id, name: otherUser.name, avatarUrl: otherUser.avatar_url } : null,
  });
}

/**
 * POST /api/conversations/[id]/messages
 * Body: { content: string }
 * Отправка сообщения. Realtime сам разошлёт INSERT всем подписанным
 * участникам (включая отправителя) — фронтенду не нужно оптимистично
 * добавлять сообщение в UI, оно придёт через подписку.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ error: "empty_message" }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: "message_too_long" }, { status: 422 });

  const admin = createAdminClient();

  const membership = await assertMembership(admin, conversationId, currentUser.userId);
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (membership.is_blocked) return NextResponse.json({ error: "blocked" }, { status: 403 });

  const { data: message, error } = await admin
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: currentUser.userId, content })
    .select("id, created_at")
    .single();

  if (error || !message) return NextResponse.json({ error: "send_failed" }, { status: 500 });

  await admin.rpc("increment_conversation_unread", {
    p_conversation_id: conversationId,
    p_exclude_user_id: currentUser.userId,
  });

  // Уведомляем остальных участников диалога о новом сообщении (кроме
  // отправителя) — иначе у людей нет способа узнать о непрочитанном,
  // кроме как самим зайти в чат.
  const { data: otherMembers } = await admin
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .neq("user_id", currentUser.userId);

  if (otherMembers && otherMembers.length > 0) {
    await admin.from("notifications").insert(
      otherMembers.map((m) => ({
        user_id: m.user_id,
        type: "new_message",
        payload: { conversationId },
      }))
    );
  }

  return NextResponse.json({ status: "sent", messageId: message.id, createdAt: message.created_at });
}
ENDOFFILE

mkdir -p "app/chats/[id]"
cat > "app/chats/[id]/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { MessageBubble, formatDayLabel, type MessageData } from "@/components/chat/MessageBubble";
import { createBrowserRealtimeClient } from "@/lib/supabase/browser-realtime";
import { useTelegramViewportHeight } from "@/lib/telegram/webapp-client";
import { useVisualViewportHeight } from "@/lib/hooks/use-visual-viewport-height";

interface ChatPageProps {
  // Next.js 14 (в этом проекте) передаёт params клиентским компонентам
  // как обычный объект, НЕ как Promise — это фича Next.js 15. Использование
  // React.use(params) здесь было реальным багом: он падает с
  // "client-side exception" при самом первом открытии страницы, потому что
  // use() поддерживает только Promise/Context, а не произвольный объект.
  params: { id: string };
}

interface OtherUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id: conversationId } = params;
  const router = useRouter();

  // visualViewport — основной источник (надёжнее в разных клиентах
  // Telegram), Telegram.WebApp.viewportHeight — запасной вариант.
  const visualViewportHeight = useVisualViewportHeight();
  const telegramViewportHeight = useTelegramViewportHeight();
  const liveHeight = visualViewportHeight ?? telegramViewportHeight;

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null);
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
        setOtherLastReadAt(history.otherMemberLastReadAt ?? null);
        setOtherUser(history.otherUser ?? null);

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
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "conversation_members",
              filter: `conversation_id=eq.${conversationId}`,
            },
            (payload) => {
              const row = payload.new as { user_id: string; last_read_at: string | null };
              // Интересует только собеседник — свою же запись о прочтении
              // мы обновляем сами при открытии чата.
              if (row.user_id !== me.userId) setOtherLastReadAt(row.last_read_at);
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
    // Пересчитываем при появлении клавиатуры (liveHeight меняется) —
    // иначе последнее сообщение может оказаться под ней.
  }, [messages.length, liveHeight]);

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
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: liveHeight ? `${liveHeight}px` : "100dvh" }}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-lavender-100 bg-white px-4 py-3">
        <button onClick={() => router.push("/chats")} aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </button>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-xs font-semibold text-ink-600">
          {otherUser?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={otherUser.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            otherUser?.name?.charAt(0).toUpperCase() ?? "?"
          )}
        </div>
        <span className="font-medium">{otherUser?.name ?? "Чат"}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {loading && <p className="text-center text-ink-600">Загрузка...</p>}
        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {messages.map((message, index) => {
          const prev = messages[index - 1];
          const showDaySeparator = !prev || !isSameDay(prev.createdAt, message.createdAt);
          const isOwn = message.senderId === myUserId;
          const isRead = Boolean(otherLastReadAt && message.createdAt <= otherLastReadAt);
          // Подпись с именем над входящим сообщением показываем только у
          // первого сообщения в подряд идущей группе от одного автора —
          // не над каждым, чтобы не загромождать чат.
          const showSenderLabel = !isOwn && (!prev || prev.senderId !== message.senderId || showDaySeparator);

          return (
            <div key={message.id}>
              {showDaySeparator && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-pill bg-lavender-100 px-3 py-1 text-[11px] font-medium text-ink-600">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
              )}
              {showSenderLabel && (
                <p className="mb-1 ml-1 text-xs font-medium text-ink-600">{otherUser?.name ?? "Собеседник"}</p>
              )}
              <MessageBubble message={message} isOwn={isOwn} readStatus={isRead ? "read" : "sent"} />
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-lavender-100 bg-white p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="Написать сообщение..."
          className="min-w-0 flex-1 rounded-pill border border-lavender-200 bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
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

function isSameDay(isoA: string, isoB: string): boolean {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
ENDOFFILE

mkdir -p "lib/hooks"
cat > "lib/hooks/use-visual-viewport-height.ts" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";

/**
 * Реальная видимая высота экрана с учётом открытой клавиатуры.
 *
 * Раньше для этого использовался Telegram.WebApp.viewportHeight — но в
 * части клиентов Telegram (особенно старых или на некоторых платформах)
 * событие viewportChanged либо не приходит, либо приходит с задержкой, и
 * "съезжание" экрана при наборе текста никуда не девалось.
 *
 * window.visualViewport — стандартный браузерный API (широко
 * поддерживается в мобильных WebView, включая тот, что использует
 * Telegram) — надёжнее, т.к. не зависит от конкретной реализации
 * Telegram-клиента, а отражает реальную видимую область страницы.
 *
 * Возвращает null на сервере/при отсутствии поддержки — в этом случае
 * экран должен откатиться на обычный CSS h-[100dvh].
 */
export function useVisualViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      setHeight(window.visualViewport!.height);
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return height;
}
ENDOFFILE

mkdir -p "components/create-event"
cat > "components/create-event/CreateEventWizard.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StepProgress } from "@/components/ui/StepProgress";
import { LocationPicker } from "@/components/map/LocationPicker";
import { getInitData, useTelegramViewportHeight } from "@/lib/telegram/webapp-client";
import { useVisualViewportHeight } from "@/lib/hooks/use-visual-viewport-height";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}
interface TrainingType {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

type Step = "category" | "trainingType" | "where" | "when" | "time" | "seats" | "cost" | "details" | "review";

const DATE_PRESETS = [
  { label: "Сегодня", offsetDays: 0 },
  { label: "Завтра", offsetDays: 1 },
];

// 3D-иконки категорий МЕСТО — тот же комплект, что на главном экране и в карточках встреч.
const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/3d/workout.png",
  cinema: "/brand/3d/movie.png",
  coffee: "/brand/3d/coffee.png",
  breakfast: "/brand/3d/breakfast.png",
  dinner: "/brand/3d/dinner.png",
  walk: "/brand/3d/walk.png",
  custom: "/brand/3d/custom-proposal.png",
};

// Компактный размер полей — весь шаг (включая карту и кнопку "Далее")
// должен помещаться на экране телефона без прокрутки страницы.
// min-w-0 + box-border обязательны: без них нативные <input type="date">
// и <input type="time"> на iOS игнорируют w-full и вылезают за край экрана
// (у flex-элементов по умолчанию min-width:auto, из-за чего браузер не
// сжимает их внутреннюю "родную" ширину до ширины контейнера).
const inputClass =
  "block w-full min-w-0 box-border rounded-card border border-lavender-200 bg-white px-4 py-3 text-base text-ink-900 outline-none focus:border-accent";

export function CreateEventWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCategory = searchParams.get("category");
  const telegramViewportHeight = useTelegramViewportHeight();
  const visualViewportHeight = useVisualViewportHeight();
  const liveHeight = visualViewportHeight ?? telegramViewportHeight;

  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);

  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categorySlug, setCategorySlug] = useState<string | null>(preselectedCategory);
  const [trainingTypeSlug, setTrainingTypeSlug] = useState<string | null>(null);
  const [placeName, setPlaceName] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [seatsTotal, setSeatsTotal] = useState(4);
  const [costType, setCostType] = useState<"each_pays" | "organizer_treats" | "free" | "negotiable">("each_pays");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories ?? []);
        setTrainingTypes(data.trainingTypes ?? []);
      });
  }, []);

  const steps: Step[] = categorySlug === "training"
    ? ["category", "trainingType", "where", "when", "time", "seats", "cost", "details", "review"]
    : ["category", "where", "when", "time", "seats", "cost", "details", "review"];

  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  function goNext() {
    setError(null);
    if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1);
  }
  function goBack() {
    setError(null);
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }

  function pickDatePreset(offsetDays: number) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    setEventDate(date.toISOString().slice(0, 10));
  }

  async function handlePublish() {
    setSubmitting(true);
    setError(null);

    const initData = getInitData();
    if (!initData) {
      setError("Открой приложение через Telegram.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categorySlug,
          trainingTypeSlug: trainingTypeSlug ?? undefined,
          placeName,
          address,
          latitude,
          longitude,
          eventDate,
          eventTime,
          seatsTotal,
          costType,
          title,
          description,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "subscription_required") {
          setError("Нужна активная подписка.");
        } else if (data.error === "events_limit_reached") {
          setError("Лимит встреч по твоему тарифу исчерпан на этот период.");
        } else if (data.error === "group_size_exceeds_plan") {
          setError(`Твой тариф позволяет группу максимум из ${data.groupMax} человек.`);
        } else {
          setError("Не получилось опубликовать встречу.");
        }
        setSubmitting(false);
        return;
      }

      router.push(`/events/${data.eventId}/applications`);
    } catch {
      setError("Проблема с соединением.");
      setSubmitting(false);
    }
  }

  const canGoNext =
    (step === "category" && categorySlug !== null) ||
    (step === "trainingType" && trainingTypeSlug !== null) ||
    (step === "where" && placeName.trim().length >= 2 && latitude !== undefined && longitude !== undefined) ||
    (step === "when" && eventDate.length > 0) ||
    (step === "time" && eventTime.length > 0) ||
    (step === "seats" && seatsTotal >= 1) ||
    step === "cost" ||
    (step === "details" && title.trim().length >= 3);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background px-5 pb-3 pt-4"
      style={{ height: liveHeight ? `${liveHeight}px` : "100dvh" }}
    >
      <StepProgress currentStep={stepIndex + 1} totalSteps={steps.length} />

      {/* min-h-0 обязателен, чтобы flex-child мог сжиматься и включать
          свою собственную прокрутку вместо раздувания всей страницы —
          так кнопка "Далее" всегда остаётся на экране без скролла. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-start gap-3 overflow-y-auto py-3">
        {step === "category" && (
          <StepBlock title="Что планируем?">
            <div className="grid grid-cols-2 gap-3">
              {categories.map((c) => {
                const icon = CATEGORY_ICON[c.slug];
                const selected = categorySlug === c.slug;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCategorySlug(c.slug);
                      setTrainingTypeSlug(null);
                    }}
                    className={`flex flex-col items-start gap-2 rounded-card p-4 text-left text-sm font-medium transition ${
                      selected ? "bg-brand-gradient text-white shadow-cta" : "bg-white text-ink-900 shadow-card"
                    }`}
                  >
                    {icon ? (
                      <div className="relative h-11 w-11">
                        <Image src={icon} alt="" fill className="object-contain" sizes="44px" />
                      </div>
                    ) : (
                      <span className="text-2xl">{c.emoji}</span>
                    )}
                    {c.name}
                  </button>
                );
              })}
            </div>
          </StepBlock>
        )}

        {step === "trainingType" && (
          <StepBlock title="Какая тренировка?">
            <div className="grid grid-cols-2 gap-2">
              {trainingTypes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTrainingTypeSlug(t.slug)}
                  className={`flex items-center gap-2 rounded-card p-3 text-left text-sm font-medium transition ${
                    trainingTypeSlug === t.slug ? "bg-brand-gradient text-white shadow-cta" : "bg-white text-ink-900 shadow-card"
                  }`}
                >
                  <span className="text-xl">{t.emoji}</span>
                  {t.name}
                </button>
              ))}
            </div>
          </StepBlock>
        )}

        {step === "where" && (
          <StepBlock title="Где?" subtitle="Впиши название места и отметь его на карте.">
            <input
              autoFocus
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              placeholder="Название места"
              className={`mb-2 ${inputClass}`}
            />
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Адрес (необязательно)"
              className={`mb-2 text-base ${inputClass}`}
            />
            <LocationPicker onPick={({ latitude, longitude }) => {
              setLatitude(latitude);
              setLongitude(longitude);
            }} />
            {placeName.trim().length >= 2 && latitude === undefined && (
              <p className="mt-2 shrink-0 text-center text-xs font-medium text-accent">
                Отметь точку на карте, чтобы продолжить
              </p>
            )}
          </StepBlock>
        )}

        {step === "when" && (
          <StepBlock title="Когда?">
            <div className="mb-3 flex gap-2">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => pickDatePreset(preset.offsetDays)}
                  className="flex-1 rounded-card bg-white p-3 text-sm font-medium text-ink-900 shadow-card"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className={inputClass}
            />
          </StepBlock>
        )}

        {step === "time" && (
          <StepBlock title="Во сколько?">
            <input
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              className={inputClass}
            />
          </StepBlock>
        )}

        {step === "seats" && (
          <StepBlock title="Сколько человек нужно?">
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setSeatsTotal((n) => Math.max(1, n - 1))}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl text-accent shadow-card active:scale-95"
              >
                −
              </button>
              <span className="text-display w-12 text-center">{seatsTotal}</span>
              <button
                onClick={() => setSeatsTotal((n) => Math.min(30, n + 1))}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl text-accent shadow-card active:scale-95"
              >
                +
              </button>
            </div>
          </StepBlock>
        )}

        {step === "cost" && (
          <StepBlock title="Как насчёт расходов?">
            <div className="flex flex-col gap-2">
              {(
                [
                  ["each_pays", "Каждый за себя"],
                  ["organizer_treats", "Автор угощает"],
                  ["free", "Без расходов"],
                  ["negotiable", "По договорённости"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setCostType(value)}
                  className={`rounded-card p-4 text-left text-sm font-medium transition ${
                    costType === value ? "bg-brand-gradient text-white shadow-cta" : "bg-white text-ink-900 shadow-card"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </StepBlock>
        )}

        {step === "details" && (
          <StepBlock title="Название и описание">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Утренняя пробежка в парке"
              maxLength={100}
              className={`mb-2 ${inputClass}`}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Короткое описание (необязательно)"
              maxLength={500}
              rows={3}
              className={`resize-none text-base ${inputClass}`}
            />
          </StepBlock>
        )}

        {step === "review" && (
          <StepBlock title="Всё верно?">
            <div className="space-y-2 rounded-card-lg bg-white p-5 shadow-card-lg">
              <ReviewRow label="Название" value={title} />
              <ReviewRow label="Место" value={placeName} />
              <ReviewRow label="Дата" value={eventDate} />
              <ReviewRow label="Время" value={eventTime} />
              <ReviewRow label="Участников" value={String(seatsTotal)} />
              <ReviewRow
                label="Расходы"
                value={
                  { each_pays: "Каждый за себя", organizer_treats: "Автор угощает", free: "Без расходов", negotiable: "По договорённости" }[
                    costType
                  ]
                }
              />
              {description && <ReviewRow label="Описание" value={description} />}
            </div>
          </StepBlock>
        )}

        {error && <p className="text-center text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex shrink-0 gap-3 pt-2">
        {stepIndex > 0 && (
          <Button variant="secondary" onClick={goBack} className="w-auto px-6">
            Назад
          </Button>
        )}
        {!isLastStep ? (
          <Button onClick={goNext} disabled={!canGoNext}>
            Далее
          </Button>
        ) : (
          <Button onClick={handlePublish} disabled={submitting}>
            {submitting ? "Публикуем..." : "Опубликовать"}
          </Button>
        )}
      </div>
    </div>
  );
}

function StepBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col space-y-3">
      <div className="shrink-0 text-center">
        <h1 className="text-title">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-ink-600">{subtitle}</p>}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-ink-600">{label}</span>
      <span className="text-right font-medium text-ink-900">{value}</span>
    </div>
  );
}
ENDOFFILE

