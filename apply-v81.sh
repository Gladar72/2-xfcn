mkdir -p "components/create-event"
cat > "components/create-event/CreateEventWizard.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StepProgress } from "@/components/ui/StepProgress";
import { LocationPicker } from "@/components/map/LocationPicker";
import { searchAddress, type AddressSuggestion } from "@/lib/maps/forward-geocode";
import { getInitData, useTelegramViewportHeight } from "@/lib/telegram/webapp-client";
import { useVisualViewportHeight } from "@/lib/hooks/use-visual-viewport-height";
import { useLockBodyScroll } from "@/lib/hooks/use-lock-body-scroll";

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
  useLockBodyScroll();
  const searchParams = useSearchParams();
  const preselectedCategory = searchParams.get("category");
  const telegramViewportHeight = useTelegramViewportHeight();
  const visualViewportHeight = useVisualViewportHeight();
  const liveHeight = visualViewportHeight ?? telegramViewportHeight;
  // Карта на шаге "Где?" — ровно половина видимой высоты экрана, по
  // явному запросу: раньше карта полагалась на flex/min-h и на деле
  // получалась заметно меньше половины экрана.
  const mapHeight = liveHeight ? Math.round(liveHeight * 0.5) : 320;

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
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [pickedFromAddress, setPickedFromAddress] = useState<{ latitude: number; longitude: number } | null>(null);
  // true сразу после того, как адрес выставлен программно (обратное
  // геокодирование по клику на карте или выбор подсказки) — тогда не надо
  // запускать поиск подсказок заново, это привело бы к бесконечному циклу.
  const suppressAddressSearchRef = useRef(false);

  useEffect(() => {
    if (suppressAddressSearchRef.current) {
      suppressAddressSearchRef.current = false;
      return;
    }
    if (address.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }
    const timeout = setTimeout(() => {
      searchAddress(address).then(setAddressSuggestions);
    }, 400);
    return () => clearTimeout(timeout);
  }, [address]);

  function handlePickAddressSuggestion(s: AddressSuggestion) {
    suppressAddressSearchRef.current = true;
    setAddress(s.address);
    setLatitude(s.latitude);
    setLongitude(s.longitude);
    setPickedFromAddress({ latitude: s.latitude, longitude: s.longitude });
    setAddressSuggestions([]);
  }
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
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
          eventEndTime,
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
    (step === "time" && eventTime.length > 0 && eventEndTime.length > 0 && eventEndTime > eventTime) ||
    (step === "seats" && seatsTotal >= 1) ||
    step === "cost" ||
    (step === "details" && title.trim().length >= 3);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background px-5 pt-4"
      style={{ height: liveHeight ? `${liveHeight}px` : "100dvh" }}
    >
      <StepProgress currentStep={stepIndex + 1} totalSteps={steps.length} />

      {/* min-h-0 обязателен, чтобы flex-child мог сжиматься и включать
          свою собственную прокрутку вместо раздувания всей страницы.
          pb-24 — запас снизу под кнопки, которые теперь настоящий fixed-
          футер (см. ниже), а не последний элемент этого же потока — иначе
          он не всегда оказывался прижат к самому низу экрана. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-start gap-3 overflow-y-auto py-3 pb-24">
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
          <StepBlock title="Где?" subtitle="Впиши название места и отметь точку на карте — адрес определится сам.">
            <input
              autoFocus
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              placeholder="Название места"
              className={`mb-2 ${inputClass}`}
            />
            <div className="relative mb-2">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Адрес — впиши сам или отметь точку на карте"
                className={`text-base ${inputClass}`}
              />
              {addressSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-card bg-white shadow-card-lg">
                  {addressSuggestions.map((s) => (
                    <button
                      key={s.address}
                      type="button"
                      onMouseDown={() => handlePickAddressSuggestion(s)}
                      className="block w-full border-b border-lavender-100 px-4 py-2.5 text-left text-sm text-ink-900 last:border-0 hover:bg-lavender-50"
                    >
                      {s.address}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <LocationPicker
              onPick={({ latitude, longitude }) => {
                setLatitude(latitude);
                setLongitude(longitude);
              }}
              onAddressResolved={(resolved) => {
                suppressAddressSearchRef.current = true;
                setAddress(resolved);
              }}
              externalCoords={pickedFromAddress}
              heightPx={mapHeight}
            />
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
          <StepBlock title="Во сколько?" subtitle="Точное время начала и окончания — по нему встреча автоматически завершится и закроется чат.">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-ink-600">Начало</label>
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-ink-600">Окончание</label>
                <input
                  type="time"
                  value={eventEndTime}
                  onChange={(e) => setEventEndTime(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            {eventTime && eventEndTime && eventEndTime <= eventTime && (
              <p className="mt-2 text-sm text-red-600">Время окончания должно быть позже начала.</p>
            )}
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
              <ReviewRow label="Время" value={`${eventTime}–${eventEndTime}`} />
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

      <div className="absolute inset-x-0 bottom-0 flex shrink-0 gap-3 bg-background px-5 pb-3 pt-2">
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

mkdir -p "lib/validation"
cat > "lib/validation/create-event.ts" << 'ENDOFFILE'
import { z } from "zod";

export const createEventSchema = z.object({
  categorySlug: z.string().min(1),
  trainingTypeSlug: z.string().optional(),

  placeName: z.string().trim().min(2, "Укажи место").max(120),
  address: z.string().trim().max(200).optional().default(""),
  latitude: z.number().optional(),
  longitude: z.number().optional(),

  eventDate: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Некорректная дата"),
  eventTime: z.string().regex(/^\d{2}:\d{2}$/, "Некорректное время"),
  eventEndTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Некорректное время")
    .optional(),

  seatsTotal: z.number().int().min(1, "Минимум 1 участник").max(30, "Максимум 30 участников"),

  costType: z.enum(["each_pays", "organizer_treats", "free", "negotiable"]).default("each_pays"),

  title: z.string().trim().min(3, "Слишком коротко").max(100),
  description: z.string().trim().max(500).optional().default(""),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
ENDOFFILE

mkdir -p "app/api/events"
cat > "app/api/events/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { isAdminTelegramId } from "@/lib/admin/is-admin";
import { rankEvents, type EventForScoring, type SubscriptionPlan } from "@/lib/scoring/rank-events";
import { getActiveSubscriptionInfo, incrementEventsCreated } from "@/lib/subscriptions/server";
import { canCreateMoreEvents, PLAN_LIMITS } from "@/lib/subscriptions/limits";
import { createEventSchema } from "@/lib/validation/create-event";
import { notifyN8n } from "@/lib/n8n/notify";

const PAGE_SIZE = 20;
// Сколько кандидатов тянем из БД до ranking (больше видимого лимита,
// чтобы скоринг реально на что-то влиял, а не только на 20 случайных строк).
const CANDIDATE_POOL_SIZE = 150;

/**
 * GET /api/events?category=slug&type=slug&city=...&page=0
 *
 * Публичная лента опубликованных встреч. Бизнес-правила:
 * - показываем только status = 'published' и дату/время >= сейчас;
 * - скрываем встречи заблокированных друг для друга людей;
 * - ranking считается на backend (service_role, читает subscriptions
 *   организатора для планового коэффициента — это НЕ видно клиенту напрямую,
 *   используется только для сортировки, см. lib/scoring/rank-events.ts).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categorySlug = searchParams.get("category");
  const categorySlugsParam = searchParams.get("categories"); // новое: несколько категорий через запятую (экран поиска)
  const typeSlug = searchParams.get("type");
  const page = Math.max(0, Number(searchParams.get("page") ?? 0) || 0);
  // Новые фильтры экрана поиска (п. запроса пользователя) — все опциональны,
  // лента (feed) их не передаёт и продолжает работать как раньше.
  const dateFilter = searchParams.get("date"); // 'today' | 'tomorrow' | 'weekend' | 'any' | 'YYYY-MM-DD'
  const timeOfDay = searchParams.get("timeOfDay"); // 'morning' | 'day' | 'evening' | 'any'
  const costTypeParam = searchParams.get("costType"); // одно значение cost_type или 'any'
  const ageMin = searchParams.get("ageMin") ? Number(searchParams.get("ageMin")) : null;
  const ageMax = searchParams.get("ageMax") ? Number(searchParams.get("ageMax")) : null;
  const genderParam = searchParams.get("gender"); // 'male' | 'female' | null (нет фильтра)

  const currentUser = await getCurrentUser();
  const admin = createAdminClient();

  let city = searchParams.get("city");
  let viewerLatitude: number | null = null;
  let viewerLongitude: number | null = null;
  let viewerInterestSlugs: string[] = [];
  let blockedOrganizerIds: string[] = [];

  if (currentUser) {
    const [{ data: profile }, { data: interestRows }, { data: blockRows }] = await Promise.all([
      admin.from("users").select("city").eq("id", currentUser.userId).maybeSingle(),
      admin
        .from("user_interests")
        .select("interests(name)")
        .eq("user_id", currentUser.userId),
      admin
        .from("blocks")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${currentUser.userId},blocked_id.eq.${currentUser.userId}`),
    ]);

    if (!city && profile?.city) city = profile.city;
    viewerInterestSlugs =
      interestRows?.map((r) => (r.interests as unknown as { name: string } | null)?.name).filter(
        (v): v is string => Boolean(v)
      ) ?? [];
    blockedOrganizerIds =
      blockRows?.map((b) =>
        b.blocker_id === currentUser.userId ? b.blocked_id : b.blocker_id
      ) ?? [];
  }

  if (!city) {
    return NextResponse.json({ error: "city_required" }, { status: 400 });
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  let query = admin
    .from("events")
    .select(
      `
      id, title, description, city, latitude, longitude, place_name, address,
      event_date, event_time, event_end_time, seats_total, seats_taken, boosted_at, created_at, cost_type,
      category:categories(slug, name, emoji),
      training_type:training_types(slug, name, emoji),
      organizer:users(id, name, avatar_url, birth_date, gender, rating_avg, completed_meetings_count, telegram_id)
      `
    )
    .eq("status", "published")
    .eq("city", city)
    .gte("event_date", todayIso)
    .order("event_date", { ascending: true })
    .limit(CANDIDATE_POOL_SIZE);

  if (categorySlugsParam) {
    const slugs = categorySlugsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (slugs.length > 0) {
      const { data: categoryRows } = await admin.from("categories").select("id").in("slug", slugs);
      const ids = (categoryRows ?? []).map((c) => c.id);
      if (ids.length > 0) query = query.in("category_id", ids);
    }
  } else if (categorySlug) {
    const { data: category } = await admin
      .from("categories")
      .select("id")
      .eq("slug", categorySlug)
      .maybeSingle();
    if (category) query = query.eq("category_id", category.id);
  }

  if (typeSlug) {
    const { data: trainingType } = await admin
      .from("training_types")
      .select("id")
      .eq("slug", typeSlug)
      .maybeSingle();
    if (trainingType) query = query.eq("training_type_id", trainingType.id);
  }

  if (costTypeParam && costTypeParam !== "any") {
    query = query.eq("cost_type", costTypeParam);
  }

  // Дата: конкретный день, либо "выходные" (ближайшие сб/вс от сегодня).
  if (dateFilter === "today") {
    query = query.eq("event_date", todayIso);
  } else if (dateFilter === "tomorrow") {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    query = query.eq("event_date", tomorrow.toISOString().slice(0, 10));
  } else if (dateFilter === "weekend") {
    const { from, to } = getUpcomingWeekendRange();
    query = query.gte("event_date", from).lte("event_date", to);
  } else if (dateFilter && dateFilter !== "any" && /^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
    query = query.eq("event_date", dateFilter);
  }

  // Время суток: утро/день/вечер по времени начала встречи.
  if (timeOfDay === "morning") {
    query = query.gte("event_time", "05:00:00").lt("event_time", "12:00:00");
  } else if (timeOfDay === "day") {
    query = query.gte("event_time", "12:00:00").lt("event_time", "18:00:00");
  } else if (timeOfDay === "evening") {
    query = query.gte("event_time", "18:00:00").lt("event_time", "23:59:59");
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error("GET /api/events — ошибка запроса к Supabase:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  let visibleRows = (rows ?? []).filter(
    (row) => !blockedOrganizerIds.includes((row.organizer as unknown as { id: string } | null)?.id ?? "")
  );

  // Возраст организатора — фильтруется на нашей стороне (не в SQL), т.к.
  // считается из birth_date, а кандидатов и так не более CANDIDATE_POOL_SIZE.
  if (ageMin !== null || ageMax !== null) {
    visibleRows = visibleRows.filter((row) => {
      const organizer = row.organizer as unknown as { birth_date: string } | null;
      if (!organizer) return false;
      const age = calculateAge(organizer.birth_date);
      if (ageMin !== null && age < ageMin) return false;
      if (ageMax !== null && age > ageMax) return false;
      return true;
    });
  }

  if (genderParam === "male" || genderParam === "female") {
    visibleRows = visibleRows.filter((row) => {
      const organizer = row.organizer as unknown as { gender: string | null } | null;
      return organizer?.gender === genderParam;
    });
  }

  // Подтягиваем активные подписки организаторов одним запросом — для planCoefficient в ranking.
  const organizerIds = Array.from(
    new Set(visibleRows.map((r) => (r.organizer as unknown as { id: string } | null)?.id).filter(Boolean))
  ) as string[];

  const { data: activeSubs } = organizerIds.length
    ? await admin
        .from("subscriptions")
        .select("user_id, plan")
        .in("user_id", organizerIds)
        .eq("status", "active")
    : { data: [] as { user_id: string; plan: SubscriptionPlan }[] };

  const planByOrganizer = new Map<string, SubscriptionPlan>(
    (activeSubs ?? []).map((s) => [s.user_id, s.plan as SubscriptionPlan])
  );

  const now = new Date();
  const scorable: (EventForScoring & { _row: (typeof visibleRows)[number] })[] = visibleRows.map((row) => {
    const category = row.category as unknown as { slug: string } | null;
    const trainingType = row.training_type as unknown as { slug: string } | null;
    const organizer = row.organizer as unknown as { id: string; telegram_id: number } | null;
    // Админ тестирует приложение без реальной подписки (см. app/api/events/route.ts
    // POST, app/api/subscriptions/route.ts) — чтобы можно было увидеть, как
    // выглядит выделение встречи Медиум/Премьер, для него тоже считаем
    // organizerPlan как "premium", как и везде, где обходятся лимиты тарифа.
    const organizerPlan: SubscriptionPlan = organizer
      ? isAdminTelegramId(organizer.telegram_id)
        ? "premium"
        : planByOrganizer.get(organizer.id) ?? null
      : null;
    return {
      id: row.id,
      createdAt: row.created_at,
      eventDate: row.event_date,
      eventTime: row.event_time,
      seatsTotal: row.seats_total,
      seatsTaken: row.seats_taken,
      boostedAt: row.boosted_at,
      organizerPlan,
      categorySlug: category?.slug ?? "",
      trainingTypeSlug: trainingType?.slug ?? null,
      latitude: row.latitude,
      longitude: row.longitude,
      _row: row,
    };
  });

  const ranked = rankEvents(scorable, {
    now,
    viewerLatitude,
    viewerLongitude,
    viewerInterestSlugs,
  });

  const pageStart = page * PAGE_SIZE;
  const pageItems = ranked.slice(pageStart, pageStart + PAGE_SIZE).map(({ _row, organizerPlan }) => {
    const organizer = _row.organizer as unknown as {
      id: string;
      name: string;
      avatar_url: string | null;
      birth_date: string;
      rating_avg: number;
      completed_meetings_count: number;
    } | null;
    const category = _row.category as unknown as { slug: string; name: string; emoji: string | null } | null;
    const trainingType = _row.training_type as unknown as { slug: string; name: string; emoji: string | null } | null;

    return {
      id: _row.id,
      title: _row.title,
      description: _row.description,
      category,
      trainingType,
      city: _row.city,
      placeName: _row.place_name,
      address: _row.address,
      eventDate: _row.event_date,
      eventTime: _row.event_time,
      eventEndTime: _row.event_end_time,
      seatsTotal: _row.seats_total,
      seatsTaken: _row.seats_taken,
      costType: _row.cost_type,
      // Лёгкое визуальное выделение карточки — привилегия тарифов
      // Медиум и Премьер (см. FEATURES в components/paywall/Paywall.tsx).
      isHighlighted: organizerPlan === "medium" || organizerPlan === "premium",
      organizer: organizer
        ? {
            id: organizer.id,
            name: organizer.name,
            avatarUrl: organizer.avatar_url,
            age: calculateAge(organizer.birth_date),
            ratingAvg: organizer.rating_avg,
            completedMeetingsCount: organizer.completed_meetings_count,
          }
        : null,
    };
  });

  return NextResponse.json({
    items: pageItems,
    page,
    hasMore: pageStart + PAGE_SIZE < ranked.length,
  });
}

function calculateAge(birthDateIso: string): number {
  const birthDate = new Date(birthDateIso);
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/** Диапазон ближайших выходных: если сегодня сб/вс — начиная с сегодня, иначе следующие сб-вс. */
function getUpcomingWeekendRange(): { from: string; to: string } {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = вс, 6 = сб

  if (dayOfWeek === 0) {
    const iso = today.toISOString().slice(0, 10);
    return { from: iso, to: iso };
  }

  const daysUntilSaturday = dayOfWeek === 6 ? 0 : 6 - dayOfWeek;
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + daysUntilSaturday);
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  return { from: saturday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

/**
 * POST /api/events
 * Создание встречи. Проверка подписки и лимита — ВСЕГДА на сервере
 * (п.26 ТЗ: "нельзя позволять frontend обходить ограничения"), даже если
 * фронтенд уже проверял то же самое для UX.
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Админ (ADMIN_TELEGRAM_IDS) тестирует приложение без ограничений подписки —
  // ни одна проверка лимитов ниже к нему не применяется. Обычные пользователи
  // по-прежнему проходят полную проверку на сервере, как и раньше (п.26 ТЗ).
  const isAdmin = isAdminTelegramId(currentUser.telegramId);

  const subscriptionInfo = await getActiveSubscriptionInfo(admin, currentUser.userId);
  if (!isAdmin) {
    if (!subscriptionInfo) {
      return NextResponse.json({ error: "subscription_required" }, { status: 402 });
    }

    if (!canCreateMoreEvents(subscriptionInfo.plan, subscriptionInfo.eventsCreatedCount)) {
      return NextResponse.json({ error: "events_limit_reached" }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => null);
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const input = parsed.data;

  const groupMax = subscriptionInfo ? PLAN_LIMITS[subscriptionInfo.plan].groupMax : PLAN_LIMITS.premium.groupMax;
  if (!isAdmin && input.seatsTotal > groupMax) {
    return NextResponse.json(
      { error: "group_size_exceeds_plan", groupMax },
      { status: 422 }
    );
  }

  const { data: category } = await admin
    .from("categories")
    .select("id")
    .eq("slug", input.categorySlug)
    .maybeSingle();
  if (!category) {
    return NextResponse.json({ error: "invalid_category" }, { status: 422 });
  }

  let trainingTypeId: string | null = null;
  if (input.categorySlug === "training") {
    if (!input.trainingTypeSlug) {
      return NextResponse.json({ error: "training_type_required" }, { status: 422 });
    }
    const { data: trainingType } = await admin
      .from("training_types")
      .select("id")
      .eq("slug", input.trainingTypeSlug)
      .maybeSingle();
    if (!trainingType) {
      return NextResponse.json({ error: "invalid_training_type" }, { status: 422 });
    }
    trainingTypeId = trainingType.id;
  }

  const { data: organizerProfile } = await admin
    .from("users")
    .select("city")
    .eq("id", currentUser.userId)
    .maybeSingle();

  const { data: createdEvent, error: insertError } = await admin
    .from("events")
    .insert({
      organizer_id: currentUser.userId,
      category_id: category.id,
      training_type_id: trainingTypeId,
      title: input.title,
      description: input.description,
      city: organizerProfile?.city ?? "",
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      place_name: input.placeName,
      address: input.address,
      event_date: input.eventDate,
      event_time: input.eventTime,
      event_end_time: input.eventEndTime ?? null,
      seats_total: input.seatsTotal,
      seats_taken: 0,
      cost_type: input.costType,
      status: "published",
    })
    .select("id")
    .single();

  if (insertError || !createdEvent) {
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  await admin.from("event_members").insert({
    event_id: createdEvent.id,
    user_id: currentUser.userId,
    role: "organizer",
  });

  // Если у админа нет реальной подписки (типичный случай при тестировании),
  // subscriptionInfo будет null — увеличивать счётчик использования нечего.
  if (subscriptionInfo) {
    await incrementEventsCreated(admin, subscriptionInfo.subscriptionId, subscriptionInfo.currentPeriodStart);
  }

  // Workflow 1 (п.27 ТЗ): находим потенциально релевантных пользователей —
  // та же логика интересов, что и в ranking (lib/scoring), но здесь как
  // одноразовый список получателей для n8n, а не как скоринг.
  notifyRelevantUsers(admin, {
    eventId: createdEvent.id,
    organizerId: currentUser.userId,
    city: organizerProfile?.city ?? "",
    categorySlug: input.categorySlug,
    trainingTypeSlug: input.trainingTypeSlug ?? null,
    title: input.title,
  }).catch(() => {});

  return NextResponse.json({ status: "created", eventId: createdEvent.id });
}

async function notifyRelevantUsers(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    eventId: string;
    organizerId: string;
    city: string;
    categorySlug: string;
    trainingTypeSlug: string | null;
    title: string;
  }
) {
  // "Релевантные пользователи" — те, у кого в интересах есть название
  // категории или типа тренировки, живут в том же городе, не заблокированы
  // организатором и не он сам.
  const interestNames = [params.categorySlug, params.trainingTypeSlug].filter(Boolean) as string[];
  if (interestNames.length === 0) return;

  const { data: matchingInterests } = await admin.from("interests").select("id, name");
  const relevantInterestIds = (matchingInterests ?? [])
    .filter((i) => interestNames.some((n) => i.name.toLowerCase().includes(n.toLowerCase())))
    .map((i) => i.id);
  if (relevantInterestIds.length === 0) return;

  const { data: candidateRows } = await admin
    .from("user_interests")
    .select("user_id, users!inner(id, telegram_id, city)")
    .in("interest_id", relevantInterestIds);

  const { data: blocks } = await admin
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${params.organizerId},blocked_id.eq.${params.organizerId}`);
  const blockedIds = new Set(
    (blocks ?? []).map((b) => (b.blocker_id === params.organizerId ? b.blocked_id : b.blocker_id))
  );

  const recipients = Array.from(
    new Map(
      (candidateRows ?? [])
        .map((r) => r.users as unknown as { id: string; telegram_id: number; city: string } | null)
        .filter(
          (u): u is { id: string; telegram_id: number; city: string } =>
            !!u && u.id !== params.organizerId && u.city === params.city && !blockedIds.has(u.id)
        )
        .map((u) => [u.id, u.telegram_id])
    ).values()
  );

  if (recipients.length === 0) return;

  await notifyN8n("event-created", {
    eventId: params.eventId,
    title: params.title,
    telegramIds: recipients,
  });
}
ENDOFFILE

mkdir -p "app/api/events/[id]"
cat > "app/api/events/[id]/route.ts" << 'ENDOFFILE'
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { getActiveSubscriptionInfo } from "@/lib/subscriptions/server";

/**
 * GET /api/events/[id]
 * Полная информация о встрече для экрана "Детали встречи" — открывается
 * по клику на карточку в ленте или на маркер на карте.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { id: eventId } = params;
  const currentUser = await getCurrentUser();
  const admin = createAdminClient();

  const { data: event, error } = await admin
    .from("events")
    .select(
      `
      id, title, description, city, latitude, longitude, place_name, address,
      event_date, event_time, event_end_time, seats_total, seats_taken, status, organizer_id,
      category:categories(slug, name, emoji),
      training_type:training_types(slug, name, emoji),
      organizer:users(id, name, avatar_url, birth_date, rating_avg, completed_meetings_count)
      `
    )
    .eq("id", eventId)
    .maybeSingle();

  if (error || !event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const organizerRow = event.organizer as unknown as {
    id: string;
    name: string;
    avatar_url: string | null;
    birth_date: string;
    rating_avg: number;
    completed_meetings_count: number;
  } | null;

  const { data: memberRows } = await admin
    .from("event_members")
    .select("role, user:users(id, name, avatar_url)")
    .eq("event_id", eventId)
    .eq("role", "participant");

  const participants = (memberRows ?? []).map((m) => {
    const user = m.user as unknown as { id: string; name: string; avatar_url: string | null };
    return { id: user.id, name: user.name, avatarUrl: user.avatar_url };
  });

  let viewerStatus: "organizer" | "accepted" | "pending" | "rejected" | "none" = "none";
  if (currentUser) {
    if (event.organizer_id === currentUser.userId) {
      viewerStatus = "organizer";
    } else {
      const { data: application } = await admin
        .from("applications")
        .select("status")
        .eq("event_id", eventId)
        .eq("user_id", currentUser.userId)
        .maybeSingle();
      if (application?.status === "accepted") viewerStatus = "accepted";
      else if (application?.status === "pending") viewerStatus = "pending";
      else if (application?.status === "rejected") viewerStatus = "rejected";
    }
  }

  return NextResponse.json({
    id: event.id,
    title: event.title,
    description: event.description,
    category: event.category,
    trainingType: event.training_type,
    city: event.city,
    placeName: event.place_name,
    address: event.address,
    latitude: event.latitude,
    longitude: event.longitude,
    eventDate: event.event_date,
    eventTime: event.event_time,
    eventEndTime: event.event_end_time,
    seatsTotal: event.seats_total,
    seatsTaken: event.seats_taken,
    status: event.status,
    organizer: organizerRow
      ? {
          id: organizerRow.id,
          name: organizerRow.name,
          avatarUrl: organizerRow.avatar_url,
          age: calculateAge(organizerRow.birth_date),
          ratingAvg: organizerRow.rating_avg,
          completedMeetingsCount: organizerRow.completed_meetings_count,
        }
      : null,
    participants,
    viewerStatus,
  });
}

function calculateAge(birthDateIso: string): number {
  const birthDate = new Date(birthDateIso);
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

/**
 * PATCH /api/events/[id]
 * Body: { action: "cancel" }
 *
 * Отмена своей встречи организатором. По запросу пользователя: "при отмене
 * встреча не списывается с баланса" — возвращаем счётчик "создано встреч за
 * период" назад (best-effort: против ТЕКУЩЕЙ активной подписки организатора,
 * а не обязательно той же, что была на момент создания — в подавляющем
 * большинстве случаев это один и тот же период).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { id: eventId } = params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (body?.action !== "cancel") {
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("id, organizer_id, status")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (event.organizer_id !== currentUser.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (event.status !== "published") {
    return NextResponse.json({ error: "cannot_cancel" }, { status: 422 });
  }

  await admin.from("events").update({ status: "cancelled" }).eq("id", eventId);

  const subscriptionInfo = await getActiveSubscriptionInfo(admin, currentUser.userId);
  if (subscriptionInfo) {
    await admin.rpc("decrement_subscription_usage_field", {
      p_subscription_id: subscriptionInfo.subscriptionId,
      p_period_start: subscriptionInfo.currentPeriodStart,
      p_field: "events_created_count",
    });
  }

  return NextResponse.json({ status: "cancelled" });
}
ENDOFFILE

mkdir -p "app/(app)/events/[id]"
cat > "app/(app)/events/[id]/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ApplicantCard, type ApplicantCardData } from "@/components/applications/ApplicantCard";

interface EventDetails {
  id: string;
  title: string;
  description: string | null;
  category: { slug: string; name: string; emoji: string | null } | null;
  trainingType: { slug: string; name: string; emoji: string | null } | null;
  placeName: string | null;
  address: string | null;
  eventDate: string;
  eventTime: string;
  eventEndTime: string | null;
  seatsTotal: number;
  seatsTaken: number;
  status: string;
  organizer: {
    id: string;
    name: string;
    avatarUrl: string | null;
    age: number;
    ratingAvg: number;
    completedMeetingsCount: number;
  } | null;
  participants: { id: string; name: string; avatarUrl: string | null }[];
  viewerStatus: "organizer" | "accepted" | "pending" | "rejected" | "none";
}

interface EventDetailsPageProps {
  // Next.js 14 (в этом проекте) — params плоский объект, НЕ Promise.
  // См. пояснение в app/chats/[id]/page.tsx про баг с use(params).
  params: { id: string };
}

const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/3d/workout.png",
  cinema: "/brand/3d/movie.png",
  coffee: "/brand/3d/coffee.png",
  breakfast: "/brand/3d/breakfast.png",
  dinner: "/brand/3d/dinner.png",
  walk: "/brand/3d/walk.png",
  custom: "/brand/3d/custom-proposal.png",
};

export default function EventDetailsPage({ params }: EventDetailsPageProps) {
  const { id: eventId } = params;
  const router = useRouter();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [boostMessage, setBoostMessage] = useState<string | null>(null);
  const [pendingApplicants, setPendingApplicants] = useState<ApplicantCardData[]>([]);
  const [processingApplicantId, setProcessingApplicantId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError("Встреча не найдена.");
          return;
        }
        setEvent(data);
        // Заявки на СВОЮ встречу показываем прямо здесь, сразу как только
        // организатор открыл событие — не нужно проваливаться ещё на один
        // экран "Управлять заявками", чтобы увидеть и принять новых людей.
        if (data.viewerStatus === "organizer") {
          loadPendingApplicants();
        }
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  function loadPendingApplicants() {
    fetch(`/api/events/${eventId}/applications`)
      .then((r) => r.json())
      .then((data) => {
        const items = (data.applications ?? []) as ApplicantCardData[];
        setPendingApplicants(items.filter((a) => a.status === "pending"));
      })
      .catch(() => {});
  }

  async function handleApplicantDecision(applicationId: string, action: "accept" | "reject") {
    setProcessingApplicantId(applicationId);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        loadPendingApplicants();
        // Обновляем и саму встречу — seatsTaken и статус (могла закрыться,
        // если это было последнее место).
        fetch(`/api/events/${eventId}`)
          .then((r) => r.json())
          .then((data) => !data.error && setEvent(data));
      }
    } finally {
      setProcessingApplicantId(null);
    }
  }

  async function handleApply() {
    setApplying(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "event_full"
            ? "Мест больше нет."
            : data.error === "cannot_apply_to_own_event"
              ? "Это твоя собственная встреча."
              : data.error === "applications_limit_reached"
                ? "Лимит откликов на встречи по твоему тарифу исчерпан за этот период — загляни в раздел «Подписка», чтобы поднять лимит."
                : "Не получилось отправить отклик."
        );
        return;
      }
      setEvent((prev) => (prev ? { ...prev, viewerStatus: "pending" } : prev));
    } finally {
      setApplying(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (res.ok) {
        setEvent((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
        setConfirmingCancel(false);
      } else {
        setError("Не получилось отменить встречу.");
      }
    } finally {
      setCancelling(false);
    }
  }

  async function handleBoost() {
    setBoosting(true);
    setBoostMessage(null);
    try {
      const res = await fetch("/api/boosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBoostMessage(
          data.error === "subscription_required"
            ? "Нужна подписка, чтобы поднимать встречи."
            : data.error === "boost_limit_reached"
              ? "Лимит подъёмов на этот месяц исчерпан."
              : "Не получилось поднять встречу."
        );
        return;
      }
      setBoostMessage(
        data.boostsLimit != null
          ? `Встреча поднята! Использовано ${data.boostsUsed} из ${data.boostsLimit} в этом месяце.`
          : "Встреча поднята!"
      );
    } finally {
      setBoosting(false);
      setTimeout(() => setBoostMessage(null), 4000);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-ink-600">Загрузка...</p>
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/feed" className="text-sm font-medium text-accent">
          Вернуться на главную
        </Link>
      </div>
    );
  }
  if (!event) return null;

  const categoryLabel = event.trainingType?.name ?? event.category?.name;
  const categoryIcon = event.category ? CATEGORY_ICON[event.category.slug] : undefined;
  const seatsLeft = event.seatsTotal - event.seatsTaken;
  const isFull = seatsLeft <= 0;

  return (
    <div className="pb-28">
      <div className="flex items-center gap-3 px-5 pt-4">
        <button onClick={() => router.back()} aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </button>
      </div>

      <div className="px-5 pt-4">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-accent">
          {categoryIcon ? (
            <div className="relative h-5 w-5 shrink-0">
              <Image src={categoryIcon} alt="" fill className="object-contain" sizes="20px" />
            </div>
          ) : (
            <span>{event.category?.emoji}</span>
          )}
          <span>{categoryLabel}</span>
        </div>

        <h1 className="text-display mb-3">{event.title}</h1>

        <div className="mb-4 space-y-1.5 text-sm text-ink-600">
          <p>
            {formatDate(event.eventDate)} ·{" "}
            {event.eventEndTime
              ? `${event.eventTime.slice(0, 5)}–${event.eventEndTime.slice(0, 5)}`
              : event.eventTime.slice(0, 5)}
          </p>
          {event.placeName && (
            <p>
              {event.placeName}
              {event.address ? `, ${event.address}` : ""}
            </p>
          )}
          <p>{isFull ? "Мест нет" : `Свободно мест: ${seatsLeft} из ${event.seatsTotal}`}</p>
        </div>

        {event.participants.length > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <div className="flex -space-x-2">
              {event.participants.slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-lavender-100 text-xs font-semibold text-ink-600"
                >
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatarUrl} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    p.name.charAt(0).toUpperCase()
                  )}
                </div>
              ))}
            </div>
            <span className="text-xs text-ink-600">
              {event.participants.length} {pluralizeParticipants(event.participants.length)}
            </span>
          </div>
        )}

        {event.description && <p className="mb-5 text-sm text-ink-900">{event.description}</p>}

        {event.organizer && (
          <div className="mb-5 flex items-center gap-3 rounded-card bg-white p-4 shadow-card">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-background text-sm font-semibold text-ink-600">
              {event.organizer.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={event.organizer.avatarUrl} alt={event.organizer.name} className="h-full w-full object-cover" />
              ) : (
                event.organizer.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-900">
                {event.organizer.name}, {event.organizer.age}
              </p>
              <p className="text-xs text-ink-600">
                {event.organizer.ratingAvg > 0 ? `⭐ ${event.organizer.ratingAvg.toFixed(1)} · ` : ""}
                {event.organizer.completedMeetingsCount} встреч проведено
              </p>
            </div>
          </div>
        )}

        {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}

        {event.status === "cancelled" && (
          <div className="mb-3 rounded-card bg-red-50 p-4 text-center text-sm text-red-600">
            Эта встреча отменена организатором.
          </div>
        )}

        {event.viewerStatus === "organizer" && event.status === "published" && (
          <div className="mb-3 space-y-3">
            {pendingApplicants.length > 0 && (
              <div className="rounded-card bg-white p-4 shadow-card">
                <h3 className="mb-3 text-sm font-semibold text-ink-900">
                  Новые заявки ({pendingApplicants.length})
                </h3>
                <div className="space-y-3">
                  {pendingApplicants.map((app) => (
                    <ApplicantCard
                      key={app.id}
                      application={app}
                      onAccept={(id) => handleApplicantDecision(id, "accept")}
                      onReject={(id) => handleApplicantDecision(id, "reject")}
                      processing={processingApplicantId === app.id}
                    />
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleBoost}
              disabled={boosting}
              className="flex w-full items-center justify-center gap-2 rounded-pill bg-brand-gradient py-3 text-sm font-semibold text-white shadow-cta disabled:opacity-60"
            >
              <span className="text-lg">🚀</span>
              {boosting ? "Поднимаем..." : "Поднять встречу"}
            </button>
            {boostMessage && <p className="text-center text-xs text-ink-600">{boostMessage}</p>}

            {!confirmingCancel ? (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="w-full text-center text-sm font-medium text-red-600"
              >
                Отменить встречу
              </button>
            ) : (
              <div className="rounded-card bg-red-50 p-4 text-center">
                <p className="mb-3 text-sm text-ink-900">Точно отменить встречу? Лимит тарифа вернётся.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmingCancel(false)}
                    className="flex-1 rounded-pill bg-white py-2.5 text-sm font-medium text-ink-600 shadow-card"
                  >
                    Не отменять
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="flex-1 rounded-pill bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {cancelling ? "Отменяем..." : "Да, отменить"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {event.status === "published" && (
        <div className="fixed inset-x-0 bottom-24 z-40 px-5">
          <BottomAction
            viewerStatus={event.viewerStatus}
            isFull={isFull}
            applying={applying}
            onApply={handleApply}
            eventId={event.id}
          />
        </div>
      )}
    </div>
  );
}

function BottomAction({
  viewerStatus,
  isFull,
  applying,
  onApply,
  eventId,
}: {
  viewerStatus: EventDetails["viewerStatus"];
  isFull: boolean;
  applying: boolean;
  onApply: () => void;
  eventId: string;
}) {
  if (viewerStatus === "organizer") {
    return (
      <Link
        href={`/events/${eventId}/applications`}
        className="block w-full rounded-pill bg-brand-gradient py-4 text-center text-base font-semibold text-white shadow-cta"
      >
        Управлять заявками
      </Link>
    );
  }
  if (viewerStatus === "accepted") {
    return (
      <div className="w-full rounded-pill bg-ink-900 py-4 text-center text-base font-semibold text-white">
        Ты идёшь ✓
      </div>
    );
  }
  if (viewerStatus === "pending") {
    return (
      <div className="w-full rounded-pill bg-ink-400/10 py-4 text-center text-base font-semibold text-ink-600">
        Отклик отправлен
      </div>
    );
  }
  if (viewerStatus === "rejected") {
    return (
      <div className="w-full rounded-pill bg-ink-400/10 py-4 text-center text-base font-semibold text-ink-400">
        Отклонено
      </div>
    );
  }

  return (
    <button
      onClick={onApply}
      disabled={isFull || applying}
      className="w-full rounded-pill bg-brand-gradient py-4 text-base font-semibold text-white shadow-cta disabled:opacity-40"
    >
      {isFull ? "Мест нет" : applying ? "Отправляем..." : "Я иду"}
    </button>
  );
}

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function pluralizeParticipants(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "человек идёт";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "человека идут";
  return "человек идут";
}
ENDOFFILE

mkdir -p "lib/reviews"
cat > "lib/reviews/complete-due-events.ts" << 'ENDOFFILE'
import type { createAdminClient } from "@/lib/supabase/admin";

const ASSUMED_EVENT_DURATION_HOURS = 2; // считаем встречу завершённой через 2ч после начала, если явно не закрыта раньше

export interface DueReviewItem {
  eventId: string;
  title: string;
  recipients: number[]; // telegram_id получателей — для n8n, чтобы реально отправить сообщение
}

/**
 * Переводит просроченные опубликованные встречи в статус 'completed' и
 * создаёт уведомления review_request участникам. Идемпотентна (safe re-run) —
 * условие status='published' и проверка "уже уведомлён" защищают от дублей.
 * Возвращает список ТОЛЬКО ЧТО обработанных встреч с telegram_id получателей —
 * нужно, чтобы n8n-воркфлоу знал, кому реально отправить сообщение в Telegram
 * (после первого вызова эти события больше не попадут в возврат повторно).
 *
 * Раньше это работало ТОЛЬКО через внешний n8n-опрос (см.
 * app/api/n8n/due-review-requests/route.ts), и если n8n не настроен —
 * встречи никогда не завершались и окно с отзывом не появлялось.
 * Теперь эта же функция вызывается лениво прямо из приложения
 * (GET /api/reviews/reviewable) при каждом заходе — работает без n8n.
 */
export async function completeDueEvents(
  admin: ReturnType<typeof createAdminClient>
): Promise<DueReviewItem[]> {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  const { data: candidates } = await admin
    .from("events")
    .select("id, title, event_date, event_time, event_end_time")
    .eq("status", "published")
    .lte("event_date", todayIso);

  const finished = (candidates ?? []).filter((e) => {
    const start = new Date(`${e.event_date}T${e.event_time}`);
    // Если организатор указал точное время окончания — используем его.
    // Иначе (старые встречи, созданные до этого поля) — прежнее
    // допущение "2 часа после начала".
    const end = e.event_end_time
      ? new Date(`${e.event_date}T${e.event_end_time}`)
      : new Date(start.getTime() + ASSUMED_EVENT_DURATION_HOURS * 60 * 60 * 1000);
    return end <= now;
  });

  if (finished.length === 0) return [];

  const finishedIds = finished.map((e) => e.id);

  await admin.from("events").update({ status: "completed" }).in("id", finishedIds).eq("status", "published");

  const { data: allFinishedMembers } = await admin
    .from("event_members")
    .select("user_id")
    .in("event_id", finishedIds);
  const uniqueMemberIds = Array.from(new Set((allFinishedMembers ?? []).map((m) => m.user_id)));
  if (uniqueMemberIds.length > 0) {
    await admin.rpc("increment_completed_meetings", { p_user_ids: uniqueMemberIds });
  }

  const { data: alreadyNotified } = await admin
    .from("notifications")
    .select("payload")
    .eq("type", "review_request");
  const alreadyNotifiedEventIds = new Set(
    (alreadyNotified ?? []).map((n) => (n.payload as { eventId?: string } | null)?.eventId).filter(Boolean)
  );

  const toNotify = finished.filter((e) => !alreadyNotifiedEventIds.has(e.id));
  if (toNotify.length === 0) return [];

  const { data: members } = await admin
    .from("event_members")
    .select("event_id, users(id, telegram_id)")
    .in(
      "event_id",
      toNotify.map((e) => e.id)
    );

  await admin.from("notifications").insert(
    toNotify.flatMap((event) =>
      (members ?? [])
        .filter((m) => m.event_id === event.id)
        .map((m) => (m.users as unknown as { id: string } | null)?.id)
        .filter((id): id is string => !!id)
        .map((userId) => ({ user_id: userId, type: "review_request", payload: { eventId: event.id } }))
    )
  );

  return toNotify
    .map((event) => {
      const recipients = (members ?? [])
        .filter((m) => m.event_id === event.id)
        .map((m) => (m.users as unknown as { telegram_id: number } | null)?.telegram_id)
        .filter((id): id is number => typeof id === "number");
      return { eventId: event.id, title: event.title, recipients };
    })
    .filter((item) => item.recipients.length > 0);
}
ENDOFFILE

