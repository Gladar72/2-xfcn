mkdir -p "lib/photos"
cat > "lib/photos/resize-image-client.ts" << 'ENDOFFILE'
"use client";

/**
 * Уменьшает фото (по большей стороне до maxSide px) и пережимает в JPEG
 * перед превращением в base64 для отправки на сервер. Фото с телефона
 * может весить несколько МБ — в base64 это ещё на треть больше и легко
 * упирается в лимит размера запроса (реальный найденный случай: без
 * этого создание встречи с фото падало с невнятной "Проблема с
 * соединением", т.к. запрос не долетал до сервера вообще).
 */
export function resizeImageFile(file: File, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode_failed"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas_unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
ENDOFFILE

mkdir -p "components/create-event"
cat > "components/create-event/CreateEventWizard.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StepProgress } from "@/components/ui/StepProgress";
import { LocationPicker } from "@/components/map/LocationPicker";
import { searchAddress, type AddressSuggestion } from "@/lib/maps/forward-geocode";
import { getInitData, useTelegramViewportHeight } from "@/lib/telegram/webapp-client";
import { useVisualViewportHeight } from "@/lib/hooks/use-visual-viewport-height";
import { useLockBodyScroll } from "@/lib/hooks/use-lock-body-scroll";
import { resizeImageFile } from "@/lib/photos/resize-image-client";

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

type Step =
  | "category"
  | "trainingType"
  | "businessTitle"
  | "where"
  | "when"
  | "time"
  | "seats"
  | "cost"
  | "businessCost"
  | "businessPhoto"
  | "chat"
  | "details"
  | "review";

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
  custom: "/brand/3d/create-event-icon.png",
};

// Компактный размер полей — весь шаг (включая карту и кнопку "Далее")
// должен помещаться на экране телефона без прокрутки страницы.
// min-w-0 + box-border обязательны: без них нативные <input type="date">
// и <input type="time"> на iOS игнорируют w-full и вылезают за край экрана
// (у flex-элементов по умолчанию min-width:auto, из-за чего браузер не
// сжимает их внутреннюю "родную" ширину до ширины контейнера).
const inputClass =
  "block w-full max-w-full min-w-0 box-border rounded-card border border-lavender-200 bg-white px-4 py-3 text-base text-ink-900 outline-none focus:border-accent";

/** "HH:MM" → минуты от начала суток. */
function timeToMinutes(t: string): number {
  const parts = t.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  return h * 60 + m;
}

/** dateIso ("YYYY-MM-DD") + n дней, тоже как "YYYY-MM-DD". */
function addDaysToIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatFullDate(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
}

export function CreateEventWizard() {
  const router = useRouter();
  useLockBodyScroll();
  const searchParams = useSearchParams();
  const preselectedCategory = searchParams.get("category");
  const preselectedTrainingType = searchParams.get("type");
  // "Для бизнеса" (см. кнопка на главном экране) — отдельная ветка мастера:
  // без готовых категорий, свой шаг про расходы (билет/бесплатно/свои
  // условия), свой лимит на размер группы и явный выбор "создавать чат?".
  const isBusiness = searchParams.get("business") === "true";
  const telegramViewportHeight = useTelegramViewportHeight();
  const visualViewportHeight = useVisualViewportHeight();
  const liveHeight = visualViewportHeight ?? telegramViewportHeight;

  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);

  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categorySlug, setCategorySlug] = useState<string | null>(preselectedCategory);
  const [trainingTypeSlug, setTrainingTypeSlug] = useState<string | null>(preselectedTrainingType);
  const [placeName, setPlaceName] = useState("");  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [pickedFromAddress, setPickedFromAddress] = useState<{ latitude: number; longitude: number } | null>(null);
  // true сразу после того, как адрес выставлен программно (обратное
  // геокодирование по клику на карте или выбор подсказки) — тогда не надо
  // запускать поиск подсказок заново, это привело бы к бесконечному циклу.
  const suppressAddressSearchRef = useRef(false);

  // Карта на шаге "Где?" — пока не введено название места, чуть компактнее;
  // как только оно появляется, карта расширяется (шире и выше) и
  // открывается поле адреса — по явному запросу пользователя: сначала
  // называешь место, потом уже точный адрес и увеличенная карта для точной
  // отметки.
  const mapHeight = liveHeight
    ? Math.round(liveHeight * (placeName.trim().length > 0 ? 0.58 : 0.34))
    : placeName.trim().length > 0
      ? 360
      : 220;

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
  const [businessPricingType, setBusinessPricingType] = useState<"ticket" | "free" | "custom" | null>(null);
  const [businessTicketPrice, setBusinessTicketPrice] = useState("");
  const [businessCustomTerms, setBusinessCustomTerms] = useState("");
  // Чат — явный выбор организатора для "Для бизнеса", доступен только при
  // небольшой группе (см. ТЗ: "не больше 20 человек"). Для обычных встреч
  // чат создаётся всегда (это состояние тогда просто не используется).
  const [wantsChat, setWantsChat] = useState(true);
  const [businessPhotoBase64, setBusinessPhotoBase64] = useState<string | undefined>();
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

  const steps: Step[] = isBusiness
    ? [
        "businessTitle",
        "where",
        "when",
        "time",
        "seats",
        "businessCost",
        "businessPhoto",
        ...(seatsTotal <= 20 ? (["chat"] as Step[]) : []),
        "details",
        "review",
      ]
    : categorySlug === "training"
      ? ["category", "trainingType", "where", "when", "time", "seats", "cost", "details", "review"]
      : ["category", "where", "when", "time", "seats", "cost", "details", "review"];

  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  function handleBusinessPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Фото с телефона может весить несколько МБ — в base64 это ещё
    // на треть больше и легко упирается в лимит размера запроса на
    // сервере (запрос тогда даже не доходит до нашего кода, и клиент
    // видит просто "Проблема с соединением", без какой-либо подсказки,
    // в чём дело — реальный найденный случай). Пережимаем на клиенте
    // перед отправкой: не больше 1600px по большей стороне, JPEG.
    resizeImageFile(file, 1600, 0.82).then(setBusinessPhotoBase64);
  }

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
          categorySlug: isBusiness ? undefined : categorySlug,
          trainingTypeSlug: trainingTypeSlug ?? undefined,
          placeName,
          address,
          latitude,
          longitude,
          eventDate,
          eventTime,
          eventEndTime,
          seatsTotal,
          costType: isBusiness
            ? businessPricingType === "free"
              ? "free"
              : businessPricingType === "ticket"
                ? "each_pays"
                : "negotiable"
            : costType,
          title,
          description,
          isBusiness,
          businessPricingType: isBusiness ? businessPricingType ?? undefined : undefined,
          businessPricingDetails: isBusiness
            ? businessPricingType === "ticket"
              ? businessTicketPrice
              : businessPricingType === "custom"
                ? businessCustomTerms
                : undefined
            : undefined,
          hasChat: isBusiness ? wantsChat : undefined,
          photoBase64: isBusiness ? businessPhotoBase64 : undefined,
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
        } else if (data.error === "photo_rejected") {
          setError("Это фото не прошло проверку — выбери другое.");
          setStepIndex(steps.indexOf("businessPhoto"));
        } else if (data.error === "photo_invalid") {
          setError("Не получилось прочитать фото — попробуй выбрать его заново.");
          setStepIndex(steps.indexOf("businessPhoto"));
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

  // Минимум час, максимум — сколько угодно, и разрешён переход на
  // следующий день (конец раньше начала по часам = считаем, что он на
  // следующие сутки, а не "некорректное" время) — по явному запросу
  // пользователя. null, если время ещё не заполнено с обеих сторон.
  const spansNextDay = eventTime && eventEndTime ? timeToMinutes(eventEndTime) <= timeToMinutes(eventTime) : false;
  const durationMinutes =
    eventTime && eventEndTime
      ? spansNextDay
        ? timeToMinutes(eventEndTime) + 24 * 60 - timeToMinutes(eventTime)
        : timeToMinutes(eventEndTime) - timeToMinutes(eventTime)
      : null;

  const canGoNext =
    (step === "category" && categorySlug !== null) ||
    (step === "trainingType" && trainingTypeSlug !== null) ||
    (step === "businessTitle" && title.trim().length >= 3) ||
    (step === "where" && placeName.trim().length >= 2 && latitude !== undefined && longitude !== undefined) ||
    (step === "when" && eventDate.length > 0) ||
    (step === "time" && eventTime.length > 0 && eventEndTime.length > 0 && (durationMinutes ?? 0) >= 60) ||
    (step === "seats" && seatsTotal >= 1) ||
    step === "cost" ||
    (step === "businessCost" &&
      businessPricingType !== null &&
      (businessPricingType !== "ticket" || businessTicketPrice.trim().length > 0) &&
      (businessPricingType !== "custom" || businessCustomTerms.trim().length > 0)) ||
    step === "chat" ||
    (step === "businessPhoto" && !!businessPhotoBase64) ||
    (step === "details" && (isBusiness || title.trim().length >= 3));

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
      {/* overflow-x-hidden — обязателен. Шаг "Где?" временно расширяет карту
          за пределы обычных отступов (-mx-5, см. ниже) — без явного запрета
          горизонтальной прокрутки здесь браузер мог "запомнить" сдвинутую
          вбок позицию скролла и перенести её на следующие шаги, из-за чего
          обычные поля (дата, время) визуально уезжали за правый край экрана. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-start gap-3 overflow-x-hidden overflow-y-auto py-3 pb-24">
        {step === "category" && (
          <StepBlock title="Что планируем?">
            <div className="grid grid-cols-2 gap-3">
              {categories.map((c) => {
                const icon = CATEGORY_ICON[c.slug];
                const selected = categorySlug === c.slug;

                // "Своё предложение" — та же кнопка, что и на главном
                // экране (иконка слева + текст справа на фирменном
                // градиенте), а не обычная квадратная плитка с иконкой
                // сверху, как у остальных категорий — по явному уточнению.
                if (c.slug === "custom") {
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCategorySlug(c.slug);
                        setTrainingTypeSlug(null);
                      }}
                      className="flex items-center gap-2 rounded-card p-4 text-left shadow-card transition active:scale-[0.98]"
                      style={{ background: "linear-gradient(135deg, #6445FB, #7A9CFA)" }}
                    >
                      <div className="relative h-16 w-16 shrink-0">
                        <Image src={icon ?? "/brand/3d/create-event-icon.png"} alt="" fill className="object-contain" sizes="64px" />
                      </div>
                      <span className="text-sm font-medium leading-tight text-white">{c.name}</span>
                    </button>
                  );
                }

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

        {step === "businessTitle" && (
          <StepBlock title="Какое событие планируете создать?" subtitle="Название того, что вы организуете — концерт, дегустация, мастер-класс и т.д.">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Дегустация вин от сомелье"
              maxLength={100}
              className={inputClass}
            />
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
              {placeName.trim().length > 0 && (
                <>
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
                </>
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
              markerIconSrc={isBusiness ? "/brand/markers/marker-business.png" : undefined}
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
              className={`${inputClass} h-[52px] appearance-none text-center`}
            />
          </StepBlock>
        )}

        {step === "time" && (
          <StepBlock title="Во сколько?" subtitle="Точное время начала и окончания — по нему встреча автоматически завершится и закроется чат.">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs font-medium text-ink-600">Начало</label>
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  className={`${inputClass} h-[52px] appearance-none text-center`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs font-medium text-ink-600">Окончание</label>
                <input
                  type="time"
                  value={eventEndTime}
                  onChange={(e) => setEventEndTime(e.target.value)}
                  className={`${inputClass} h-[52px] appearance-none text-center`}
                />
              </div>
            </div>
            {/* Минимум час, максимум — сколько угодно, и может уходить на
                следующий день (например, начало в 22:00, конец в 04:00) —
                по явному запросу пользователя. Раньше сравнение "конец >
                начала" было простым сравнением строк времени, из-за чего
                любая встреча, заканчивающаяся после полуночи, считалась
                "некорректной" и блокировала переход дальше. */}
            {eventTime && eventEndTime && durationMinutes !== null && durationMinutes < 60 && (
              <p className="mt-2 text-sm text-red-600">Встреча должна длиться хотя бы час.</p>
            )}
            {eventTime && eventEndTime && durationMinutes !== null && durationMinutes >= 60 && (
              <p className="mt-3 rounded-card bg-lavender-50 p-3 text-center text-sm text-ink-900">
                Встреча начнётся {formatFullDate(eventDate)} в {eventTime}
                {spansNextDay ? (
                  <>
                    {" "}
                    и закончится {formatFullDate(addDaysToIso(eventDate, 1))} в {eventEndTime}
                  </>
                ) : (
                  <> и закончится в {eventEndTime}</>
                )}
              </p>
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
                onClick={() => setSeatsTotal((n) => Math.min(isBusiness ? 500 : 30, n + 1))}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl text-accent shadow-card active:scale-95"
              >
                +
              </button>
            </div>
            {isBusiness && seatsTotal > 20 && (
              <p className="mt-3 text-center text-xs text-ink-600">
                При группе больше 20 человек общий чат не создаётся — люди будут откликаться напрямую.
              </p>
            )}
          </StepBlock>
        )}

        {step === "businessCost" && (
          <StepBlock title="Как насчёт расходов?">
            <div className="flex flex-col gap-2">
              {(
                [
                  ["ticket", "По билетам"],
                  ["free", "Бесплатно"],
                  ["custom", "Другие условия"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setBusinessPricingType(value)}
                  className={`rounded-card p-4 text-left text-sm font-medium transition ${
                    businessPricingType === value ? "bg-brand-gradient text-white shadow-cta" : "bg-white text-ink-900 shadow-card"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {businessPricingType === "ticket" && (
              <input
                autoFocus
                value={businessTicketPrice}
                onChange={(e) => setBusinessTicketPrice(e.target.value)}
                placeholder="Например: 1500 ₽"
                maxLength={50}
                className={`mt-3 ${inputClass}`}
              />
            )}
            {businessPricingType === "custom" && (
              <textarea
                autoFocus
                value={businessCustomTerms}
                onChange={(e) => setBusinessCustomTerms(e.target.value)}
                placeholder="Опиши условия — что и как оплачивается"
                maxLength={300}
                rows={3}
                className={`mt-3 resize-none text-base ${inputClass}`}
              />
            )}
          </StepBlock>
        )}

        {step === "businessPhoto" && (
          <StepBlock title="Фото события" subtitle="Обязательно для событий «Для бизнеса» — с фото событие выглядит заметнее.">
            <label className="flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-card-lg bg-white shadow-card">
              {businessPhotoBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={businessPhotoBase64} alt="Фото события" className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-medium text-accent">Загрузить фото</span>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleBusinessPhotoChange} />
            </label>
            {businessPhotoBase64 && (
              <button onClick={() => setBusinessPhotoBase64(undefined)} className="mt-2 w-full text-center text-sm font-medium text-red-600">
                Убрать и выбрать другое
              </button>
            )}
          </StepBlock>
        )}

        {step === "chat" && (
          <StepBlock title="Создавать чат?" subtitle="Общий чат для всех, кого примут на событие — можно списаться до встречи.">
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setWantsChat(true)}
                className={`rounded-card p-4 text-left text-sm font-medium transition ${
                  wantsChat ? "bg-brand-gradient text-white shadow-cta" : "bg-white text-ink-900 shadow-card"
                }`}
              >
                Да, создать чат
              </button>
              <button
                onClick={() => setWantsChat(false)}
                className={`rounded-card p-4 text-left text-sm font-medium transition ${
                  !wantsChat ? "bg-brand-gradient text-white shadow-cta" : "bg-white text-ink-900 shadow-card"
                }`}
              >
                Нет, без чата — только заявки
              </button>
            </div>
            {!wantsChat && (
              <p className="mt-3 text-center text-xs text-ink-600">
                Люди будут откликаться на событие, ты увидишь заявки прямо в нём и получишь уведомление.
              </p>
            )}
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
          <StepBlock title={isBusiness ? "Описание" : "Название и описание"}>
            {!isBusiness && (
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например: Утренняя пробежка в парке"
                maxLength={100}
                className={`mb-2 ${inputClass}`}
              />
            )}
            <textarea
              autoFocus={isBusiness}
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
              <ReviewRow
                label="Время"
                value={spansNextDay ? `${eventTime}–${eventEndTime} (на след. день)` : `${eventTime}–${eventEndTime}`}
              />
              <ReviewRow label="Участников" value={String(seatsTotal)} />
              {isBusiness ? (
                <>
                  <ReviewRow
                    label="Расходы"
                    value={
                      businessPricingType === "ticket"
                        ? `Билет: ${businessTicketPrice}`
                        : businessPricingType === "custom"
                          ? businessCustomTerms
                          : "Бесплатно"
                    }
                  />
                  {seatsTotal <= 20 && <ReviewRow label="Чат" value={wantsChat ? "Создаётся" : "Без чата"} />}
                </>
              ) : (
                <ReviewRow
                  label="Расходы"
                  value={
                    { each_pays: "Каждый за себя", organizer_treats: "Автор угощает", free: "Без расходов", negotiable: "По договорённости" }[
                      costType
                    ]
                  }
                />
              )}
              {description && <ReviewRow label="Описание" value={description} />}
            </div>
          </StepBlock>
        )}

        {error && <p className="text-center text-sm text-red-600">{error}</p>}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex shrink-0 gap-3 bg-background px-5 pb-3 pt-2">
        <Button
          variant="secondary"
          onClick={stepIndex > 0 ? goBack : () => router.back()}
          className="w-auto px-6"
        >
          Назад
        </Button>
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

mkdir -p "components/onboarding"
cat > "components/onboarding/OnboardingWizard.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StepProgress } from "@/components/ui/StepProgress";
import { CityPicker } from "@/components/ui/CityPicker";
import { getInitData } from "@/lib/telegram/webapp-client";
import { resizeImageFile } from "@/lib/photos/resize-image-client";

interface Interest {
  id: string;
  name: string;
  emoji: string | null;
}

type Step = "photo" | "name" | "birthDate" | "gender" | "city" | "bio" | "interests" | "review";
const STEPS: Step[] = ["photo", "name", "birthDate", "gender", "city", "bio", "interests", "review"];

export function OnboardingWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [photoBase64, setPhotoBase64] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [selectedInterestIds, setSelectedInterestIds] = useState<string[]>([]);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    fetch("/api/interests")
      .then((r) => r.json())
      .then((data) => setInterests(data.interests ?? []))
      .catch(() => setInterests([]));
  }, []);

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  function goNext() {
    setError(null);
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
  }
  function goBack() {
    setError(null);
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }

  function toggleInterest(id: string) {
    setSelectedInterestIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    resizeImageFile(file, 1600, 0.82).then(setPhotoBase64);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    const initData = getInitData();
    if (!initData) {
      setError("Открой приложение через Telegram, чтобы продолжить.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          profile: {
            name,
            birthDate,
            gender,
            agreedToTerms,
            city,
            bio,
            interestIds: selectedInterestIds,
            photoBase64,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "validation_failed") {
          setError("Проверь, что все поля заполнены корректно.");
        } else if (data.error === "photo_rejected") {
          setError("Фото не прошло проверку — выбери другое и попробуй снова.");
        } else if (data.error === "already_registered") {
          window.location.href = "/feed";
          return;
        } else {
          setError("Не получилось сохранить профиль. Попробуй ещё раз.");
        }
        setSubmitting(false);
        return;
      }

      window.location.href = "/feed";
    } catch {
      setError("Проблема с соединением. Попробуй ещё раз.");
      setSubmitting(false);
    }
  }

  const canGoNext =
    (step === "photo") ||
    (step === "name" && name.trim().length >= 2) ||
    (step === "birthDate" && birthDate.length > 0) ||
    (step === "gender" && gender !== null) ||
    (step === "city" && city.trim().length >= 2) ||
    (step === "bio") ||
    (step === "interests");

  return (
    <div className="flex min-h-screen flex-col px-5 pb-8 pt-6">
      <StepProgress currentStep={stepIndex + 1} totalSteps={STEPS.length} />

      <div className="flex flex-1 flex-col justify-center gap-6 py-10">
        {step === "photo" && (
          <StepBlock title="Добавь фото" subtitle="Можно пропустить и добавить позже, в профиле.">
            <label className="flex aspect-square w-40 mx-auto items-center justify-center overflow-hidden rounded-full bg-white shadow-card">
              {photoBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoBase64} alt="Фото профиля" className="h-full w-full object-cover" />
              ) : (
                <span className="text-4xl">📷</span>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </label>
          </StepBlock>
        )}

        {step === "name" && (
          <StepBlock title="Как тебя зовут?">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Имя"
              className="w-full rounded-card border border-ink-400/20 bg-white px-5 py-4 text-lg outline-none focus:border-accent"
            />
          </StepBlock>
        )}

        {step === "birthDate" && (
          <StepBlock title="Дата рождения" subtitle="Сервис доступен пользователям 18+.">
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full rounded-card border border-ink-400/20 bg-white px-5 py-4 text-lg outline-none focus:border-accent"
            />
          </StepBlock>
        )}

        {step === "gender" && (
          <StepBlock title="Твой пол">
            <div className="flex gap-3">
              {(
                [
                  ["male", "Мужчина"],
                  ["female", "Женщина"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGender(value)}
                  className={`flex-1 rounded-card border p-5 text-center text-base font-medium transition ${
                    gender === value
                      ? "border-accent bg-brand-gradient text-white shadow-cta"
                      : "border-ink-400/20 bg-white text-ink-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </StepBlock>
        )}

        {step === "city" && (
          <StepBlock title="Твой город">
            <CityPicker
              autoFocus
              value={city}
              onChange={setCity}
              placeholder="Начни вводить город"
              className="w-full rounded-card border border-ink-400/20 bg-white px-5 py-4 text-lg outline-none focus:border-accent"
            />
          </StepBlock>
        )}

        {step === "bio" && (
          <StepBlock title="Пару слов о себе" subtitle="Необязательно, но помогает другим тебя узнать.">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={300}
              rows={4}
              placeholder="Расскажи немного о себе..."
              className="w-full resize-none rounded-card border border-ink-400/20 bg-white px-5 py-4 text-lg outline-none focus:border-accent"
            />
          </StepBlock>
        )}

        {step === "interests" && (
          <StepBlock title="Что тебе интересно?" subtitle="Выбери несколько — необязательно.">
            <div className="flex flex-wrap gap-2">
              {interests.map((interest) => {
                const selected = selectedInterestIds.includes(interest.id);
                return (
                  <button
                    key={interest.id}
                    type="button"
                    onClick={() => toggleInterest(interest.id)}
                    className={`rounded-pill border px-4 py-2 text-sm font-medium transition ${
                      selected
                        ? "border-accent bg-accent text-white"
                        : "border-ink-400/20 bg-white text-ink-900"
                    }`}
                  >
                    {interest.emoji} {interest.name}
                  </button>
                );
              })}
            </div>
          </StepBlock>
        )}

        {step === "review" && (
          <StepBlock title="Всё верно?">
            <div className="space-y-2 rounded-card bg-white p-5 shadow-card">
              <ReviewRow label="Имя" value={name} />
              <ReviewRow label="Дата рождения" value={birthDate} />
              <ReviewRow label="Пол" value={gender === "male" ? "Мужчина" : "Женщина"} />
              <ReviewRow label="Город" value={city} />
              {bio && <ReviewRow label="О себе" value={bio} />}
            </div>

            <label className="mt-4 flex items-start gap-2 text-xs text-ink-600">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
              />
              <span>
                Я принимаю условия{" "}
                <a href="/legal/offer" target="_blank" className="text-accent underline">
                  публичной оферты
                </a>{" "}
                и{" "}
                <a href="/legal/privacy" target="_blank" className="text-accent underline">
                  политики конфиденциальности
                </a>
              </span>
            </label>
          </StepBlock>
        )}

        {error && <p className="text-center text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex gap-3">
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
          <Button onClick={handleSubmit} disabled={submitting || !agreedToTerms}>
            {submitting ? "Сохраняем..." : "Готово"}
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
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="text-display">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-600">{subtitle}</p>}
      </div>
      {children}
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

mkdir -p "app/(app)/profile"
cat > "app/(app)/profile/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { type Plan } from "@/lib/subscriptions/limits";
import { AvatarViewer } from "@/components/profile/AvatarViewer";
import { resizeImageFile } from "@/lib/photos/resize-image-client";

interface Profile {
  name: string;
  avatarUrl: string | null;
  age: number;
  city: string;
  bio: string | null;
  ratingAvg: number;
  ratingCount: number;
  completedMeetingsCount: number;
  eventsOrganizedCount: number;
  eventsAttendedCount: number;
  memberSince: string;
}

interface SubscriptionStatus {
  active: boolean;
  plan?: Plan;
  periodEnd?: string;
}

const PLAN_TITLES: Record<Plan, string> = { start: "Старт", medium: "Медиум", premium: "Премьер" };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/me/profile").then((r) => r.json()),
      fetch("/api/subscriptions").then((r) => r.json()),
    ])
      .then(([profileData, subData]) => {
        if (!profileData.error) {
          setProfile(profileData);
          setEditName(profileData.name);
          setEditBio(profileData.bio ?? "");
        }
        setSubscription(subData);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <p className="text-ink-600">Загрузка...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6 text-center">
        <p className="text-ink-600">Не удалось загрузить профиль.</p>
      </div>
    );
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Файл больше 5 МБ — выбери другое фото.");
      setTimeout(() => setUploadError(null), 3000);
      return;
    }

    setUploadingPhoto(true);
    setUploadError(null);
    try {
      const dataUrl = await resizeImageFile(file, 1600, 0.82);
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoBase64: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(
          data.error === "photo_rejected" ? "Это фото не прошло проверку — выбери другое." : "Не получилось загрузить фото."
        );
        return;
      }
      setProfile((prev) => (prev ? { ...prev, avatarUrl: data.avatarUrl } : prev));
    } catch {
      setUploadError("Проблема с соединением.");
    } finally {
      setUploadingPhoto(false);
      setTimeout(() => setUploadError(null), 3000);
    }
  }

  async function saveEdit() {
    setSavingEdit(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, bio: editBio }),
      });
      if (res.ok) {
        setProfile((prev) => (prev ? { ...prev, name: editName, bio: editBio } : prev));
        setEditing(false);
      }
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="px-5 py-6">
      <div className="mb-2 flex justify-end">
        <Link href="/settings" aria-label="Настройки">
          <Image src="/brand/icons/settings.svg" alt="" width={22} height={22} />
        </Link>
      </div>

      <div className="mb-4 flex flex-col items-center text-center">
        <div className="relative mb-3">
          {profile.avatarUrl ? (
            <AvatarViewer src={profile.avatarUrl} alt={profile.name}>
              <div className="h-24 w-24 overflow-hidden rounded-full bg-white shadow-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={profile.avatarUrl} alt={profile.name} className="h-full w-full object-cover" />
              </div>
            </AvatarViewer>
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-2xl font-semibold text-ink-600 shadow-card">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm text-white shadow-card active:scale-95"
            aria-label="Изменить фото"
          >
            {uploadingPhoto ? "…" : "✏️"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelected}
          />
        </div>

        <h1 className="text-title">
          {profile.name}, {profile.age}
        </h1>
        <p className="mt-1 flex items-center gap-1 text-sm text-ink-600">
          <Image src="/brand/icons/location.svg" alt="" width={14} height={14} />
          {profile.city}
        </p>
        {profile.ratingCount > 0 && (
          <p className="mt-1 flex items-center gap-1 text-sm text-ink-600">
            <Image src="/brand/icons/star.svg" alt="" width={14} height={14} />
            {profile.ratingAvg.toFixed(1)} ({profile.ratingCount}{" "}
            {pluralize(profile.ratingCount, "оценка", "оценки", "оценок")})
          </p>
        )}

        <button
          onClick={() => setEditing((v) => !v)}
          className="mt-3 rounded-pill bg-lavender-100 px-5 py-2 text-sm font-medium text-accent"
        >
          Редактировать профиль
        </button>
      </div>

      {editing && (
        <div className="mb-5 space-y-2 rounded-card bg-white p-4 shadow-card">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Имя"
            maxLength={50}
            className="w-full min-w-0 box-border rounded-card border border-lavender-200 bg-background px-3 py-2 text-base outline-none focus:border-accent"
          />
          <textarea
            value={editBio}
            onChange={(e) => setEditBio(e.target.value)}
            placeholder="О себе"
            maxLength={300}
            rows={3}
            className="w-full min-w-0 box-border resize-none rounded-card border border-lavender-200 bg-background px-3 py-2 text-base outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="flex-1 rounded-pill border border-lavender-200 bg-white py-2.5 text-sm font-medium text-ink-600"
            >
              Отмена
            </button>
            <button
              onClick={saveEdit}
              disabled={savingEdit || editName.trim().length < 2}
              className="flex-1 rounded-pill bg-brand-gradient py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingEdit ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </div>
      )}

      {uploadError && <p className="mb-4 text-center text-sm text-red-600">{uploadError}</p>}

      {!editing && profile.bio && <p className="mb-6 text-center text-sm text-ink-900">{profile.bio}</p>}

      <div className="mb-6 grid grid-cols-3 gap-2 rounded-card-lg bg-white py-4 shadow-card">
        <StatItem value={String(profile.eventsOrganizedCount)} label="создано" />
        <StatItem value={String(profile.eventsAttendedCount)} label="посещено" />
        <StatItem value={String(profile.completedMeetingsCount)} label="состоялось" />
      </div>

      <div className="space-y-1.5 rounded-card-lg bg-white p-1.5 shadow-card">
        <MenuRow href="/my-events" icon="/brand/icons/calendar.svg" label="Мои встречи" />
        <MenuRow href="/notifications" icon="/brand/icons/bell.svg" label="Уведомления" />
        <MenuRow
          href="/subscriptions"
          icon="/brand/icons/gift.svg"
          label="Подписка"
          value={subscription?.active ? PLAN_TITLES[subscription.plan!] : "не оформлена"}
        />
        <MenuRow href="/reviews" icon="/brand/icons/star.svg" label="Отзывы после встреч" />
      </div>
    </div>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold text-ink-900">{value}</div>
      <div className="text-xs text-ink-600">{label}</div>
    </div>
  );
}

function MenuRow({
  href,
  icon,
  label,
  value,
}: {
  href: string;
  icon: string;
  label: string;
  value?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-card px-3 py-3">
      <Image src={icon} alt="" width={18} height={18} />
      <span className="flex-1 text-sm text-ink-900">{label}</span>
      {value && <span className="text-sm text-ink-400">{value}</span>}
      <span className="text-ink-400">›</span>
    </Link>
  );
}

function pluralize(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return few;
  return many;
}
ENDOFFILE

