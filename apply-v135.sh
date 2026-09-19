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
        ...(seatsTotal <= 20 ? (["chat"] as Step[]) : []),
        "details",
        "review",
      ]
    : categorySlug === "training"
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
    (step === "businessTitle" && title.trim().length >= 3) ||
    (step === "where" && placeName.trim().length >= 2 && latitude !== undefined && longitude !== undefined) ||
    (step === "when" && eventDate.length > 0) ||
    (step === "time" && eventTime.length > 0 && eventEndTime.length > 0 && eventEndTime > eventTime) ||
    (step === "seats" && seatsTotal >= 1) ||
    step === "cost" ||
    (step === "businessCost" &&
      businessPricingType !== null &&
      (businessPricingType !== "ticket" || businessTicketPrice.trim().length > 0) &&
      (businessPricingType !== "custom" || businessCustomTerms.trim().length > 0)) ||
    step === "chat" ||
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
                        <Image src={icon} alt="" fill className="object-contain" sizes="64px" />
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
              <ReviewRow label="Время" value={`${eventTime}–${eventEndTime}`} />
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
