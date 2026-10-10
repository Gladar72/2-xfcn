"use client";

import { CATEGORY_ICON, trainingIcon } from "@/lib/data/category-icons";
import { Character } from "@/components/brand/AliveStage";
import { Icon } from "@/components/brand/Icon";
import { EventCard, coverGradient } from "@/components/feed/EventCard";
import { showGuide } from "@/lib/mosya/guide";
import { confetti } from "@/lib/mosya/confetti";
import { peek, say } from "@/lib/mosya/peek";
import clsx from "clsx";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StepProgress } from "@/components/ui/StepProgress";
import { LocationPicker } from "@/components/map/LocationPicker";
import { searchAddress, type AddressSuggestion } from "@/lib/maps/forward-geocode";
import { getInitData, useTelegramViewportHeight } from "@/lib/telegram/webapp-client";
import { useVisualViewportHeight } from "@/lib/hooks/use-visual-viewport-height";
import { useLockBodyScroll } from "@/lib/hooks/use-lock-body-scroll";
import { PhotoCropModal } from "./PhotoCropModal";
import { apiErrorText } from "@/lib/validation/api-error-text";

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
  | "anonymity"
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


// Компактный размер полей — весь шаг (включая карту и кнопку "Далее")
// должен помещаться на экране телефона без прокрутки страницы.
// min-w-0 + box-border обязательны: без них нативные <input type="date">
// и <input type="time"> на iOS игнорируют w-full и вылезают за край экрана
// (у flex-элементов по умолчанию min-width:auto, из-за чего браузер не
// сжимает их внутреннюю "родную" ширину до ширины контейнера).
const inputClass =
  "m-glass block w-full max-w-full min-w-0 box-border rounded-[20px] border-0 px-4 py-3.5 text-base text-ink-900 outline-none focus:shadow-[inset_0_0_0_2px_#9B5CFF]";

/** Вариант выбора: стекло, выбранный — белый с фиолетовым контуром и галочкой. */
const optionClass = (selected: boolean) =>
  clsx(
    "m-press relative rounded-[22px] p-4 text-left text-sm font-medium transition",
    selected
      ? "bg-white/90 text-ink-900 shadow-[inset_0_0_0_2px_#9B5CFF,0_12px_24px_-16px_rgba(130,60,255,.8)]"
      : "m-glass text-ink-900"
  );

function Check({ on }: { on: boolean }) {
  return (
    <span
      className={clsx(
        "absolute right-3 top-3 grid h-[22px] w-[22px] place-items-center rounded-full bg-brand-gradient text-white transition-transform duration-500 ease-spring",
        on ? "scale-100" : "scale-0"
      )}
    >
      <Icon name="check" size={13} strokeWidth={2.6} />
    </span>
  );
}

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
  // Анонимная встреча: имя, фото и точный адрес скрыты до одобрения заявки.
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [businessPhotoBase64, setBusinessPhotoBase64] = useState<string | undefined>();
  const [cropSrc, setCropSrc] = useState<string | undefined>();
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
    : // Первый вопрос обычной встречи — открыто или анонимно.
      // Обложка теперь есть у любой встречи: своё фото или фирменная
      // обложка категории (обязательно фото только для «Своего предложения»).
      categorySlug === "training"
      ? ["anonymity", "category", "trainingType", "where", "when", "time", "seats", "cost", "details", "businessPhoto", "review"]
      : ["anonymity", "category", "where", "when", "time", "seats", "cost", "details", "businessPhoto", "review"];

  const photoRequired = isBusiness || categorySlug === "custom";

  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  // Мося-гид на ключевых шагах (только в первый раз после регистрации).
  useEffect(() => {
    if (step === "category" || (isBusiness && step === "businessTitle")) showGuide("create", { low: true });
    if (step === "businessPhoto") showGuide("cover", { low: true });
    if (step === "where") showGuide("when", { low: true });
  }, [step, isBusiness]);

  function handleBusinessPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Сначала показываем окно обрезки — пережатие (resizeImageFile) больше
    // не нужно отдельным шагом: сама обрезка уже отдаёт готовый кадр
    // нужного разрешения (см. PhotoCropModal).
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  function goNext() {
    // Кнопка «Далее» больше не серая-и-молчаливая: если на шаге чего-то не
    // хватает, показываем, чего именно.
    if (!canGoNext) {
      setError(stepHint());
      return;
    }
    setError(null);
    if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1);
  }

  /** Что нужно сделать, чтобы пройти текущий шаг. */
  function stepHint(): string {
    switch (step) {
      case "category":
        return "Выбери, какую встречу создаёшь.";
      case "trainingType":
        return "Выбери вид тренировки.";
      case "businessTitle":
        return "Название — минимум 3 символа.";
      case "where":
        if (placeName.trim().length < 2) return "Напиши, где встречаемся — название места (минимум 2 символа).";
        return "Отметь место на карте или выбери адрес из подсказок.";
      case "when":
        return "Выбери дату встречи.";
      case "time":
        if (!eventTime || !eventEndTime) return "Укажи время начала и окончания.";
        return "Встреча должна длиться минимум 1 час.";
      case "seats":
        return "Нужен хотя бы 1 участник кроме тебя.";
      case "businessCost":
        if (businessPricingType === null) return "Выбери условия участия.";
        if (businessPricingType === "ticket") return "Укажи цену билета.";
        return "Опиши условия участия.";
      case "businessPhoto":
        return "Добавь фото — для этого типа встречи оно обязательно.";
      case "details":
        return "Название встречи — минимум 3 символа.";
      default:
        return "Заполни этот шаг, чтобы продолжить.";
    }
  }

  /** Шаг мастера, на котором заполняется поле, про которое пожаловался сервер. */
  function stepForField(field: string | null | undefined): Step | null {
    const map: Record<string, Step> = {
      categorySlug: "category",
      trainingTypeSlug: "trainingType",
      title: isBusiness ? "businessTitle" : "details",
      description: "details",
      placeName: "where",
      address: "where",
      latitude: "where",
      longitude: "where",
      eventDate: "when",
      eventTime: "time",
      eventEndTime: "time",
      seatsTotal: "seats",
      costType: isBusiness ? "businessCost" : "cost",
      businessPricingType: "businessCost",
      businessPricingDetails: "businessCost",
      businessCustomTerms: "businessCost",
      photoBase64: "businessPhoto",
      hasChat: "chat",
      isAnonymous: "anonymity",
    };
    const target = field ? map[field] : undefined;
    return target && steps.includes(target) ? target : null;
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
          isAnonymous: isBusiness ? undefined : isAnonymous,
          photoBase64: businessPhotoBase64,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Сервер говорит, что именно не так (и в каком поле) — показываем
        // это человеку и сразу открываем нужный шаг, чтобы исправить.
        setError(apiErrorText(data, "Не получилось опубликовать встречу. Попробуй ещё раз.", res.status));
        say("Тут что-то не так — я открыл нужный шаг, поправь и попробуем ещё раз");
        const targetStep = stepForField(data.field);
        if (targetStep) setStepIndex(steps.indexOf(targetStep));
        setSubmitting(false);
        return;
      }

      confetti();
      peek({ pose: "jump", text: "Встреча опубликована! Заявки придут сюда и в Telegram 🎉", quick: true, low: true });
      setTimeout(() => router.push(`/events/${data.eventId}/applications`), 900);
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
    step === "anonymity" ||
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
    (step === "businessPhoto" && (!!businessPhotoBase64 || !photoRequired)) ||
    (step === "details" && (isBusiness || title.trim().length >= 3));

  return (
    <div
      className="m-aurora fixed inset-0 z-50 flex flex-col overflow-hidden px-5 pt-4"
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
      <div
        className={clsx(
          "flex min-h-0 min-w-0 flex-1 flex-col justify-start gap-3 overflow-x-hidden overflow-y-auto py-3",
          error ? "pb-44" : "pb-24"
        )}
      >
        {step === "anonymity" && (
          <StepBlock title="Как публикуем встречу?">
            <div className="flex flex-col gap-2">
              <button onClick={() => setIsAnonymous(false)} className={optionClass(!isAnonymous)}>
                <Check on={!isAnonymous} />
                <span className="block text-[15px] font-semibold">Открыто</span>
                <span className="mt-0.5 block text-xs font-normal text-ink-600">
                  Все видят твой профиль и место встречи
                </span>
              </button>
              <button onClick={() => setIsAnonymous(true)} className={optionClass(isAnonymous)}>
                <Check on={isAnonymous} />
                <span className="block text-[15px] font-semibold">Анонимно</span>
                <span className="mt-0.5 block text-xs font-normal text-ink-600">
                  Твои имя, фото и точный адрес увидят только те, чью заявку ты одобришь
                </span>
              </button>
            </div>
            <div className="m-glass mt-3 rounded-[20px] px-4 py-3 text-xs leading-relaxed text-ink-600">
              <p>
                Как работает анонимность: пока ты не одобришь заявку, человек не увидит твоё фото, имя и точный
                адрес — только описание встречи, район и твой рейтинг. Как только одобришь — он увидит твой профиль,
                место встречи и попадёт в общий чат. Для безопасности «Место» всегда знает, кто создал встречу.
              </p>
            </div>
          </StepBlock>
        )}

        {step === "category" && (
          <StepBlock title="Что планируем?">
            <div className="m-stagger grid grid-cols-4 gap-2">
              {categories
                .filter((c) => c.slug !== "custom")
                .map((c) => {
                  const icon = CATEGORY_ICON[c.slug];
                  const selected = categorySlug === c.slug;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCategorySlug(c.slug);
                        setTrainingTypeSlug(null);
                      }}
                      className={clsx(
                        "m-cat",
                        selected ? "bg-white/90 shadow-[inset_0_0_0_2px_#9B5CFF,0_12px_24px_-16px_rgba(130,60,255,.8)]" : "m-glass"
                      )}
                    >
                      {icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={icon} alt="" />
                      ) : (
                        <span className="text-3xl leading-[52px]">{c.emoji}</span>
                      )}
                      <span>{tileName(c.name)}</span>
                    </button>
                  );
                })}
            </div>
            {categories.some((c) => c.slug === "custom") && (
              <button
                onClick={() => {
                  setCategorySlug("custom");
                  setTrainingTypeSlug(null);
                }}
                className={clsx(
                  "m-own relative mt-2",
                  categorySlug === "custom" ? "bg-white/90 shadow-[inset_0_0_0_2px_#9B5CFF,0_12px_24px_-16px_rgba(130,60,255,.8)]" : "m-glass"
                )}
              >
                <Check on={categorySlug === "custom"} />
                <span className="m-star">
                  <Character shape="star" pal="peach" face="sly" size={62} seed={11} />
                </span>
                <span className="min-w-0 flex-1 pr-6">
                  <b className="block text-[15.5px] font-medium">Своё предложение</b>
                  <span className="block text-[13px] leading-snug text-ink-600">Не нашёл подходящего? Придумай сам — от сапов до вязания</span>
                </span>
              </button>
            )}
          </StepBlock>
        )}

        {step === "trainingType" && (
          <StepBlock title="Какая тренировка?">
            <div className="m-stagger grid grid-cols-3 gap-2">
              {trainingTypes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTrainingTypeSlug(t.slug)}
                  className={clsx(
                    "m-cat",
                    trainingTypeSlug === t.slug ? "bg-white/90 shadow-[inset_0_0_0_2px_#9B5CFF,0_12px_24px_-16px_rgba(130,60,255,.8)]" : "m-glass"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={trainingIcon(t.slug)} alt="" />
                  <span>{t.name}</span>
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
                    <div className="m-fade-in absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-[20px] bg-white/95 shadow-card-lg backdrop-blur-xl">
                      {addressSuggestions.map((s) => (
                        <button
                          key={s.address}
                          type="button"
                          onMouseDown={() => handlePickAddressSuggestion(s)}
                          className="flex w-full items-center gap-2 border-b border-lavender-100 px-4 py-3 text-left text-sm text-ink-900 last:border-0 hover:bg-lavender-50"
                        >
                          <Icon name="pin" size={16} className="text-accent" />
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
                  className="m-glass m-press flex-1 rounded-pill p-3 text-sm font-medium text-ink-900"
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
              <p className="m-glass mt-3 rounded-[20px] p-3 text-center text-sm text-ink-900">
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
          <StepBlock title="Сколько человек ищешь?" subtitle={`Не считая тебя. На встрече будет: ты + ${seatsTotal} = ${seatsTotal + 1} чел.`}>
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => {
                  if (seatsTotal <= 1) {
                    setError("Нужен хотя бы 1 участник кроме тебя.");
                    return;
                  }
                  setError(null);
                  setSeatsTotal((n) => n - 1);
                }}
                className="m-glass m-press flex h-14 w-14 items-center justify-center rounded-full text-2xl text-accent"
              >
                −
              </button>
              <span className="w-20 text-center text-[52px] font-medium leading-none tracking-tight">{seatsTotal}</span>
              <button
                onClick={() => {
                  const max = isBusiness ? 500 : 30;
                  if (seatsTotal >= max) {
                    setError(`Максимум ${max} участников.`);
                    return;
                  }
                  setError(null);
                  setSeatsTotal((n) => n + 1);
                }}
                className="m-glass m-press flex h-14 w-14 items-center justify-center rounded-full text-2xl text-accent"
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
                  className={optionClass(businessPricingType === value)}
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
          <StepBlock
            title="Обложка встречи"
            subtitle={
              photoRequired
                ? "Обязательно — с фото встречу замечают чаще."
                : "Загрузи своё фото или оставь фирменную обложку — она уже готова."
            }
          >
            <label
              className="m-hero relative flex w-full cursor-pointer items-center justify-center overflow-hidden"
              style={{ aspectRatio: "1.4", background: businessPhotoBase64 ? undefined : coverGradient(categorySlug, isBusiness) }}
            >
              {businessPhotoBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={businessPhotoBase64} alt="Фото события" className="ph" />
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={isBusiness ? CATEGORY_ICON.business : categorySlug === "training" ? trainingIcon(trainingTypeSlug) : CATEGORY_ICON[categorySlug ?? ""] ?? CATEGORY_ICON.custom}
                    alt=""
                    className="absolute right-[-4%] top-[6%] h-[70%] w-auto rotate-[-8deg] object-contain drop-shadow-[0_20px_30px_rgba(60,20,140,0.35)]"
                  />
                  <span className="relative z-[2] mt-auto mb-4 flex items-center gap-2 rounded-pill bg-white/25 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-md">
                    <Icon name="camera" size={18} /> Загрузить своё фото
                  </span>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleBusinessPhotoChange} />
            </label>
            {businessPhotoBase64 && (
              <button onClick={() => setBusinessPhotoBase64(undefined)} className="mt-2 w-full text-center text-sm font-medium text-[#D6336C]">
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
                className={optionClass(wantsChat)}
              >
                Да, создать чат
              </button>
              <button
                onClick={() => setWantsChat(false)}
                className={optionClass(!wantsChat)}
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
                  className={optionClass(costType === value)}
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
          <StepBlock title="Так увидят встречу">
            <div className="pointer-events-none">
              <EventCard
                event={{
                  id: "preview",
                  title: title || "Твоя встреча",
                  description: description || null,
                  category: isBusiness ? null : categories.find((c) => c.slug === categorySlug) ?? null,
                  trainingType: trainingTypes.find((t) => t.slug === trainingTypeSlug) ?? null,
                  placeName,
                  address,
                  eventDate: eventDate || new Date().toISOString().slice(0, 10),
                  eventTime: eventTime || "19:00",
                  seatsTotal,
                  seatsTaken: 0,
                  organizer: null,
                  isAnonymous: !isBusiness && isAnonymous,
                  isBusiness,
                  photoUrl: businessPhotoBase64 ?? null,
                  isMine: true,
                }}
              />
            </div>
            <div className="m-glass space-y-2 rounded-[24px] p-5">
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
              {!isBusiness && <ReviewRow label="Публикация" value={isAnonymous ? "Анонимно" : "Открыто"} />}
            </div>
          </StepBlock>
        )}

      </div>

      <div className="absolute inset-x-0 bottom-0 shrink-0 bg-gradient-to-t from-[#F6F2FF] via-[#F6F2FF]/90 to-transparent px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-6">
        {/* Ошибка — прямо над кнопками, чтобы её было видно на любом шаге,
            а не где-то внизу прокрутки. */}
        {error && (
          <div role="alert" className="m-pop mb-2 rounded-[18px] bg-white/90 px-4 py-3 text-center text-sm font-medium text-[#D6336C] shadow-card">
            {error}
          </div>
        )}
        <div className="flex gap-3">
        <Button
          variant="secondary"
          onClick={stepIndex > 0 ? goBack : () => router.back()}
          className="w-auto px-6"
        >
          Назад
        </Button>
        {!isLastStep ? (
          <Button onClick={goNext} className={clsx(!canGoNext && "opacity-40")}>
            Далее
          </Button>
        ) : (
          <Button onClick={handlePublish} disabled={submitting}>
            {submitting ? "Публикуем..." : "Опубликовать"}
          </Button>
        )}
        </div>
      </div>

      {cropSrc && (
        <PhotoCropModal
          src={cropSrc}
          aspectRatio={1.4}
          onCancel={() => setCropSrc(undefined)}
          onConfirm={(dataUrl) => {
            setBusinessPhotoBase64(dataUrl);
            setCropSrc(undefined);
          }}
        />
      )}
    </div>
  );
}

/** Короткие подписи для плиток 4 в ряд. */
function tileName(name: string) {
  const map: Record<string, string> = {
    "Совместная тренировка": "Тренировка",
    "Попить кофе": "Кофе",
    "Совместный завтрак": "Завтрак",
    "Поужинать": "Ужин",
  };
  return map[name] ?? name;
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
      <div key={title} className="m-stagger shrink-0 text-left">
        <h1 className="m-title text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[13px] leading-snug text-ink-600">{subtitle}</p>}
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
