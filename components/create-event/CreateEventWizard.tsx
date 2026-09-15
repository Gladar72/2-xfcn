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
