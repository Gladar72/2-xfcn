"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LocationPicker } from "@/components/map/LocationPicker";
import { searchAddress, type AddressSuggestion } from "@/lib/maps/forward-geocode";
import { getInitData } from "@/lib/telegram/webapp-client";
import { useLockBodyScroll } from "@/lib/hooks/use-lock-body-scroll";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { CATEGORY_ICON, trainingIcon } from "@/lib/data/category-icons";
import { Character } from "@/components/brand/AliveStage";
import { Icon } from "@/components/brand/Icon";
import { Mosya } from "@/components/brand/Mosya";
import { EventCard } from "@/components/feed/EventCard";
import { ShareEventButton, eventShareUrl } from "@/components/events/ShareEventButton";
import { showGuide } from "@/lib/mosya/guide";
import { confetti } from "@/lib/mosya/confetti";
import { peek, say } from "@/lib/mosya/peek";
import { PhotoCropModal } from "./PhotoCropModal";

/**
 * Создание встречи в 4 шага (редизайн 2026, как в прототипе):
 *   1. Что планируем — категории, тип тренировки, «Своё предложение»
 *   2. Название и обложка — своё фото или обложка, которую рисует Мося
 *   3. Когда и где — день, время, длительность, место с подсказками
 *   4. Кто и сколько — число людей, расходы, открыто/анонимно, превью
 * После публикации — экран «Встреча опубликована» с «Поделиться».
 * Отправляет на сервер те же поля, что и прежний мастер (POST /api/events).
 */

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
interface PlaceSuggestion {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  source: "yandex" | "history";
}
type CostType = "each_pays" | "organizer_treats" | "free" | "negotiable";

const STEPS = ["what", "cover", "when", "who"] as const;
type Step = (typeof STEPS)[number];

const COSTS: [CostType, string, string][] = [
  ["each_pays", "Каждый за себя", "Каждый платит за своё"],
  ["organizer_treats", "Автор угощает", "Ты платишь за всех"],
  ["free", "Без расходов", "Ничего платить не нужно"],
  ["negotiable", "По договорённости", "Обсудите в чате"],
];
const DURATIONS = [60, 90, 120, 180, 240];

const TILE: Record<string, string> = {
  "Совместная тренировка": "Тренировка",
  "Попить кофе": "Кофе",
  "Совместный завтрак": "Завтрак",
  Поужинать: "Ужин",
};

const isoDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dayLabel = (offset: number) => {
  if (offset === 0) return "Сегодня";
  if (offset === 1) return "Завтра";
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric" }).replace(".", "");
};
const addMinutes = (hhmm: string, mins: number) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const t = (h * 60 + m + mins) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const nextRoundTime = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${d.getMinutes() < 30 ? "30" : "00"}`;
};

const selCls = "bg-white/90 shadow-[inset_0_0_0_2px_#9B5CFF,0_12px_24px_-16px_rgba(130,60,255,.8)]";
const inputCls =
  "m-glass block w-full min-w-0 box-border rounded-[20px] border-0 px-4 py-3.5 text-base text-ink-900 outline-none focus:shadow-[inset_0_0_0_2px_#9B5CFF]";

export function CreateMeetingFlow() {
  const router = useRouter();
  useLockBodyScroll();
  const searchParams = useSearchParams();

  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const step: Step = STEPS[stepIndex] ?? "what";
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);

  const [categorySlug, setCategorySlug] = useState<string | null>(searchParams.get("category"));
  const [trainingTypeSlug, setTrainingTypeSlug] = useState<string | null>(searchParams.get("type"));
  const [trainingSheet, setTrainingSheet] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [photoKind, setPhotoKind] = useState<"own" | "mosya" | null>(null);
  const [covers, setCovers] = useState<string[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [cropSrc, setCropSrc] = useState<string | undefined>();

  const [eventDate, setEventDate] = useState(isoDay(0));
  const [eventTime, setEventTime] = useState(nextRoundTime());
  const [duration, setDuration] = useState(120);
  const [customDuration, setCustomDuration] = useState(false);
  const [placeName, setPlaceName] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [externalCoords, setExternalCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placeFocus, setPlaceFocus] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const suppressAddressSearch = useRef(false);

  const [seatsTotal, setSeatsTotal] = useState(3);
  const [costType, setCostType] = useState<CostType>("each_pays");
  const [isAnonymous, setIsAnonymous] = useState(false);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories ?? []);
        setTrainingTypes(data.trainingTypes ?? []);
      })
      .catch(() => {});
  }, []);

  // Мося-гид на шагах — только первый раз после регистрации.
  useEffect(() => {
    if (step === "what") showGuide("create", { low: true });
    if (step === "cover") showGuide("cover", { low: true });
    if (step === "when") showGuide("when", { low: true });
  }, [step]);

  const category = categories.find((c) => c.slug === categorySlug) ?? null;
  const trainingType = trainingTypes.find((t) => t.slug === trainingTypeSlug) ?? null;
  const categoryIconSrc =
    categorySlug === "training" ? trainingIcon(trainingTypeSlug) : (categorySlug && CATEGORY_ICON[categorySlug]) || CATEGORY_ICON.custom || "";

  // Обложки от Моси: перерисовываем, когда меняется категория.
  useEffect(() => {
    if (step !== "cover" || !categoryIconSrc) return;
    let cancelled = false;
    drawCovers(categoryIconSrc).then((list) => {
      if (cancelled) return;
      setCovers(list);
      if (!photo || photoKind === "mosya") {
        setPhoto(list[coverIndex] ?? list[0]);
        setPhotoKind("mosya");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, categoryIconSrc]);

  // Подсказки мест под категорию (кинотеатры для «Кино» и т.д.) + по введённому тексту.
  useEffect(() => {
    if (step !== "when") return;
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (categorySlug) p.set("category", categorySlug);
      if (trainingTypeSlug) p.set("type", trainingTypeSlug);
      if (placeName.trim().length >= 2) p.set("q", placeName.trim());
      fetch(`/api/places?${p.toString()}`)
        .then((r) => r.json())
        .then((d) => setPlaceSuggestions(Array.isArray(d.items) ? d.items : []))
        .catch(() => setPlaceSuggestions([]));
    }, 300);
    return () => clearTimeout(t);
  }, [step, categorySlug, trainingTypeSlug, placeName]);

  // Автодополнение адреса.
  useEffect(() => {
    if (suppressAddressSearch.current) {
      suppressAddressSearch.current = false;
      return;
    }
    if (address.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }
    const t = setTimeout(() => searchAddress(address).then(setAddressSuggestions), 400);
    return () => clearTimeout(t);
  }, [address]);

  function pickPlace(p: PlaceSuggestion) {
    suppressAddressSearch.current = true;
    setPlaceName(p.name);
    setAddress(p.address);
    setLatitude(p.latitude);
    setLongitude(p.longitude);
    setExternalCoords({ latitude: p.latitude, longitude: p.longitude });
    setPlaceFocus(false);
  }
  function pickAddress(s: AddressSuggestion) {
    suppressAddressSearch.current = true;
    setAddress(s.address);
    setLatitude(s.latitude);
    setLongitude(s.longitude);
    setExternalCoords({ latitude: s.latitude, longitude: s.longitude });
    setAddressSuggestions([]);
  }

  function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  const eventEndTime = addMinutes(eventTime, duration);
  const photoRequired = categorySlug === "custom";

  function hint(): string | null {
    if (step === "what") {
      if (!categorySlug) return "Выбери, что планируешь.";
      if (categorySlug === "training" && !trainingTypeSlug) return "Выбери вид тренировки.";
    }
    if (step === "cover") {
      if (title.trim().length < 3) return "Название — минимум 3 символа.";
      if (photoRequired && !photo) return "Добавь обложку — фото или вариант от Моси.";
    }
    if (step === "when") {
      if (!eventDate || !eventTime) return "Выбери день и время.";
      if (duration < 60) return "Встреча должна длиться хотя бы час.";
      if (placeName.trim().length < 2) return "Напиши, где встречаемся.";
      if (latitude === undefined || longitude === undefined) return "Выбери место из подсказок или отметь точку на карте.";
    }
    if (step === "who" && seatsTotal < 1) return "Нужен хотя бы 1 человек кроме тебя.";
    return null;
  }

  function next() {
    const h = hint();
    if (h) {
      setError(h);
      say(h, "think");
      return;
    }
    setError(null);
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
    else publish();
  }
  function back() {
    setError(null);
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
    else router.back();
  }

  async function publish() {
    setSubmitting(true);
    setError(null);
    if (!getInitData()) {
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
          isBusiness: false,
          isAnonymous,
          photoBase64: photo,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(apiErrorText(data, "Не получилось опубликовать встречу. Попробуй ещё раз.", res.status));
        const map: Record<string, Step> = {
          categorySlug: "what",
          trainingTypeSlug: "what",
          title: "cover",
          description: "cover",
          photoBase64: "cover",
          placeName: "when",
          address: "when",
          latitude: "when",
          longitude: "when",
          eventDate: "when",
          eventTime: "when",
          eventEndTime: "when",
          seatsTotal: "who",
          costType: "who",
          isAnonymous: "who",
        };
        const target = typeof data.field === "string" ? map[data.field] : undefined;
        if (target) setStepIndex(STEPS.indexOf(target));
        say("Тут что-то не так — я открыл нужный шаг, поправь и попробуем ещё раз");
        setSubmitting(false);
        return;
      }
      confetti();
      setPublishedId(data.eventId as string);
      setTimeout(() => peek({ pose: "jump", text: "Готово! Заявки придут в Telegram — ты сам решаешь, кого принять", quick: true }), 700);
    } catch {
      setError("Проблема с соединением.");
      setSubmitting(false);
    }
  }

  const previewEvent = {
    id: "preview",
    title: title || "Твоя встреча",
    description: description || null,
    category: category ? { slug: category.slug, name: category.name, emoji: category.emoji } : null,
    trainingType: trainingType ? { slug: trainingType.slug, name: trainingType.name, emoji: trainingType.emoji } : null,
    placeName,
    address,
    eventDate,
    eventTime,
    seatsTotal,
    seatsTaken: 0,
    organizer: null,
    isAnonymous,
    photoUrl: photo ?? null,
    isMine: true,
  };

  if (publishedId) {
    return (
      <div className="m-aurora fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center">
        <Mosya pose="jump" size={170} className="m-pop" />
        <h1 className="m-title mt-2">
          Встреча <span className="m-em">опубликована</span>
        </h1>
        <p className="mt-2 max-w-[300px] text-[14.5px] leading-snug text-ink-600">
          Её уже видят люди рядом. Заявки придут сюда и в Telegram — ты сам решаешь, кого принять.
        </p>
        <div className="m-glass mt-6 w-full max-w-[400px] rounded-[24px] p-4 text-left">
          <b className="block text-[15px] font-medium">Поделиться встречей</b>
          <p className="mt-1 break-all text-xs text-ink-400">{eventShareUrl(publishedId)}</p>
          <ShareEventButton eventId={publishedId} title={title} when={`${eventDate.split("-").reverse().join(".")}, ${eventTime}`} className="mt-3 w-full" />
        </div>
        <button onClick={() => router.push(`/events/${publishedId}/applications`)} className="m-btn m-btn-v mt-4 max-w-[400px]">
          К заявкам
        </button>
        <button onClick={() => router.push("/my-events")} className="m-btn mt-1 h-12 max-w-[400px] text-ink-600">
          Мои встречи
        </button>
      </div>
    );
  }

  const h = hint();

  return (
    <div className="m-aurora fixed inset-0 z-50 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-[max(14px,env(safe-area-inset-top))]">
        <button onClick={back} aria-label={stepIndex ? "Назад" : "Закрыть"} className="m-glass m-press grid h-11 w-11 shrink-0 place-items-center rounded-full">
          <Icon name={stepIndex ? "back" : "close"} size={22} />
        </button>
        <div className="flex flex-1 gap-1.5">
          {STEPS.map((s, i) => (
            <i key={s} className={clsx("h-1.5 flex-1 rounded-pill transition-colors duration-500", i <= stepIndex ? "bg-brand-gradient" : "bg-white/60")} />
          ))}
        </div>
        <span className="text-xs text-ink-400">{stepIndex + 1}/4</span>
      </div>

      <div key={step} className="m-fade-in min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-40 pt-5">
        {step === "what" && (
          <>
            <Head title="Что" em="планируем?" sub="Выбери, во что будет встреча. Так её найдут люди с похожими интересами." />
            <div className="m-stagger grid grid-cols-4 gap-2">
              {categories
                .filter((c) => c.slug !== "custom")
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCategorySlug(c.slug);
                      if (c.slug === "training") setTrainingSheet(true);
                      else setTrainingTypeSlug(null);
                    }}
                    className={clsx("m-cat relative", categorySlug === c.slug ? selCls : "m-glass")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.slug === "training" && trainingTypeSlug ? trainingIcon(trainingTypeSlug) : CATEGORY_ICON[c.slug] ?? CATEGORY_ICON.custom} alt="" />
                    <span>{c.slug === "training" && trainingType ? trainingType.name : TILE[c.name] ?? c.name}</span>
                  </button>
                ))}
            </div>
            {categories.some((c) => c.slug === "custom") && (
              <button
                onClick={() => {
                  setCategorySlug("custom");
                  setTrainingTypeSlug(null);
                }}
                className={clsx("m-own relative mt-2", categorySlug === "custom" ? selCls : "m-glass")}
              >
                <span className={clsx("m-star", categorySlug === "custom" && "spin")}>
                  <Character shape="star" pal="peach" face="sly" size={62} seed={11} />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[15.5px] font-medium">Своё предложение</b>
                  <span className="block text-[13px] leading-snug text-ink-600">Не нашёл подходящего? Придумай сам — от сапов до вязания</span>
                </span>
              </button>
            )}
            {categorySlug === "custom" && (
              <div className="m-fade-in mt-3">
                <label className="mb-1.5 block px-1 text-[12.5px] font-medium text-ink-600">Чем займёмся?</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: сапы, вязание, бадминтон" maxLength={100} className={inputCls} />
                <p className="mt-1.5 px-1 text-xs text-ink-400">Встреча попадёт в раздел «Другое» и в поиск по этому слову.</p>
              </div>
            )}
          </>
        )}

        {step === "cover" && (
          <>
            <Head title="Название" em="и обложка" sub="Короткое название и картинка решают, придут ли люди." />
            <label className="mb-1.5 block px-1 text-[12.5px] font-medium text-ink-600">Название</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={category?.slug === "coffee" ? "Кофе на крыше" : "Например: утренняя пробежка в парке"}
              maxLength={100}
              className={inputCls}
            />
            <div className="mb-2 mt-4 flex items-center justify-between px-1">
              <span className="text-[12.5px] font-medium text-ink-600">Обложка</span>
              <span className="m-chip m-chip-lav h-6 px-2.5 text-[11px]">✦ Нарисовал Мося</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {covers.map((c, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setCoverIndex(i);
                    setPhoto(c);
                    setPhotoKind("mosya");
                  }}
                  className={clsx("m-press relative aspect-[1.4] overflow-hidden rounded-[18px]", photoKind === "mosya" && coverIndex === i && "shadow-[0_0_0_3px_#fff,0_0_0_5px_#9B5CFF]")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c} alt={`Обложка ${i + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
              {covers.length === 0 && [0, 1, 2].map((i) => <div key={i} className="m-sk aspect-[1.4]" />)}
            </div>
            <label className={clsx("m-glass m-press mt-2 flex cursor-pointer items-center gap-3 rounded-[20px] p-3", photoKind === "own" && selCls)}>
              {photoKind === "own" && photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="h-14 w-20 rounded-[14px] object-cover" />
              ) : (
                <span className="grid h-14 w-20 place-items-center rounded-[14px] bg-[rgba(108,59,255,.1)] text-accent">
                  <Icon name="camera" size={24} />
                </span>
              )}
              <span className="flex-1">
                <b className="block text-[14.5px] font-medium">{photoKind === "own" ? "Твоё фото" : "Загрузить своё фото"}</b>
                <span className="text-xs text-ink-600">Своё фото всегда смотрится живее</span>
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            </label>
            <label className="mb-1.5 mt-4 block px-1 text-[12.5px] font-medium text-ink-600">Описание · необязательно</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Что будем делать, как узнать друг друга"
              maxLength={500}
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </>
        )}

        {step === "when" && (
          <>
            <Head title="Когда" em="и где?" sub="Выбери день и время, потом место — адрес подставлю сам." />
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[0, 1, 2, 3, 4, 5, 6].map((o) => (
                <button
                  key={o}
                  onClick={() => setEventDate(isoDay(o))}
                  className={clsx("m-press h-11 shrink-0 rounded-pill px-4 text-sm font-medium", eventDate === isoDay(o) ? "bg-ink-900 text-white" : "m-glass")}
                >
                  {dayLabel(o)}
                </button>
              ))}
              <label className="m-glass m-press relative flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-pill px-4 text-sm font-medium text-accent">
                <Icon name="cal" size={18} /> Календарь
                <input
                  type="date"
                  value={eventDate}
                  min={isoDay(0)}
                  onChange={(e) => e.target.value && setEventDate(e.target.value)}
                  className="absolute inset-0 opacity-0"
                />
              </label>
            </div>

            <div className="m-glass mt-3 flex items-center gap-3 rounded-[24px] p-3">
              <div className="flex-1">
                <span className="block px-1 text-xs text-ink-400">Начало</span>
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  className="w-full appearance-none bg-transparent px-1 text-[34px] font-medium tracking-tight outline-none"
                />
              </div>
              <div className="text-right">
                <span className="block text-xs text-ink-400">Конец</span>
                <b className="text-[22px] font-medium tracking-tight text-ink-600">{eventEndTime}</b>
              </div>
            </div>

            <span className="mb-1.5 mt-3 block px-1 text-[12.5px] font-medium text-ink-600">Сколько продлится</span>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setDuration(d);
                    setCustomDuration(false);
                  }}
                  className={clsx("m-press h-10 rounded-pill px-4 text-sm font-medium", !customDuration && duration === d ? "bg-ink-900 text-white" : "m-glass")}
                >
                  {d % 60 ? `${Math.floor(d / 60)},5 ч` : `${d / 60} ч`}
                </button>
              ))}
              <button
                onClick={() => setCustomDuration(true)}
                className={clsx("m-press h-10 rounded-pill px-4 text-sm font-medium", customDuration ? "bg-ink-900 text-white" : "m-glass")}
              >
                Своё
              </button>
            </div>
            {customDuration && (
              <div className="m-fade-in mt-2 flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={72}
                  value={Math.floor(duration / 60)}
                  onChange={(e) => setDuration(Math.max(0, Number(e.target.value || 0)) * 60 + (duration % 60))}
                  className={`${inputCls} w-24 text-center`}
                />
                <span className="text-sm text-ink-600">ч</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={59}
                  step={5}
                  value={duration % 60}
                  onChange={(e) => setDuration(Math.floor(duration / 60) * 60 + Math.min(59, Math.max(0, Number(e.target.value || 0))))}
                  className={`${inputCls} w-24 text-center`}
                />
                <span className="text-sm text-ink-600">мин</span>
              </div>
            )}

            <span className="mb-1.5 mt-4 block px-1 text-[12.5px] font-medium text-ink-600">Место</span>
            <div className="relative">
              <input
                value={placeName}
                onChange={(e) => setPlaceName(e.target.value)}
                onFocus={() => setPlaceFocus(true)}
                onBlur={() => setTimeout(() => setPlaceFocus(false), 150)}
                placeholder="Название места или адрес"
                className={inputCls}
              />
              {placeFocus && placeSuggestions.length > 0 && (
                <div className="m-fade-in absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-[20px] bg-white/95 shadow-card-lg backdrop-blur-xl">
                  {placeSuggestions.map((p) => (
                    <button key={p.name + p.address} type="button" onMouseDown={() => pickPlace(p)} className="flex w-full items-start gap-2 border-b border-lavender-100 px-4 py-3 text-left last:border-0">
                      <Icon name="pin" size={16} className="mt-0.5 text-accent" />
                      <span className="min-w-0">
                        <b className="block truncate text-sm font-medium">{p.name}</b>
                        {p.address && <span className="block truncate text-xs text-ink-400">{p.address}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {placeSuggestions.length > 0 && !placeFocus && (
              <div className="mt-2">
                <span className="m-chip m-chip-lav mb-1.5 h-6 px-2.5 text-[11px]">✦ Мося рекомендует{category ? ` для «${TILE[category.name] ?? category.name}»` : ""}</span>
                <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {placeSuggestions.slice(0, 6).map((p) => (
                    <button
                      key={p.name}
                      onClick={() => pickPlace(p)}
                      className={clsx("m-press shrink-0 rounded-[16px] px-3 py-2 text-left", placeName === p.name ? selCls : "m-glass")}
                    >
                      <b className="block max-w-[180px] truncate text-[13px] font-medium">{p.name}</b>
                      {p.address && <span className="block max-w-[180px] truncate text-[11px] text-ink-400">{p.address}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {placeName.trim().length > 0 && (
              <div className="relative mt-2">
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Адрес — начни вводить или отметь на карте" className={inputCls} />
                {addressSuggestions.length > 0 && (
                  <div className="m-fade-in absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-[20px] bg-white/95 shadow-card-lg backdrop-blur-xl">
                    {addressSuggestions.map((s) => (
                      <button key={s.address} type="button" onMouseDown={() => pickAddress(s)} className="flex w-full items-center gap-2 border-b border-lavender-100 px-4 py-3 text-left text-sm last:border-0">
                        <Icon name="pin" size={16} className="text-accent" />
                        {s.address}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="mt-2 overflow-hidden rounded-[24px] shadow-card">
              <LocationPicker
                onPick={({ latitude: la, longitude: lo }) => {
                  setLatitude(la);
                  setLongitude(lo);
                }}
                onAddressResolved={(resolved) => {
                  suppressAddressSearch.current = true;
                  setAddress(resolved);
                }}
                externalCoords={externalCoords}
                heightPx={240}
              />
            </div>
          </>
        )}

        {step === "who" && (
          <>
            <Head title="Кто" em="и сколько?" sub="Все приходят по заявке — ты сам решаешь, кого принять." />
            <span className="mb-1.5 block px-1 text-[12.5px] font-medium text-ink-600">Сколько человек ищешь</span>
            <div className="m-glass flex items-center justify-between rounded-[24px] p-2">
              <button onClick={() => setSeatsTotal((n) => Math.max(1, n - 1))} className="m-press grid h-12 w-12 place-items-center rounded-full bg-white text-2xl text-accent shadow-card">
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={30}
                value={seatsTotal}
                onChange={(e) => setSeatsTotal(Math.max(1, Math.min(30, Number(e.target.value || 1))))}
                className="w-24 bg-transparent text-center text-[40px] font-medium tracking-tight outline-none"
              />
              <button onClick={() => setSeatsTotal((n) => Math.min(30, n + 1))} className="m-press grid h-12 w-12 place-items-center rounded-full bg-white text-2xl text-accent shadow-card">
                +
              </button>
            </div>
            <p className="mt-1.5 px-1 text-xs text-ink-400">
              Не считая тебя. На встрече будет: ты + {seatsTotal} = {seatsTotal + 1} чел.
            </p>

            <span className="mb-1.5 mt-4 block px-1 text-[12.5px] font-medium text-ink-600">Как насчёт расходов?</span>
            <div className="grid grid-cols-2 gap-2">
              {COSTS.map(([v, label, sub]) => (
                <button key={v} onClick={() => setCostType(v)} className={clsx("m-press relative rounded-[20px] p-3 text-left", costType === v ? selCls : "m-glass")}>
                  <b className="block text-[14px] font-medium">{label}</b>
                  <span className="text-[11.5px] text-ink-400">{sub}</span>
                </button>
              ))}
            </div>

            <span className="mb-1.5 mt-4 block px-1 text-[12.5px] font-medium text-ink-600">Как публикуем?</span>
            <div className="grid gap-2">
              <button onClick={() => setIsAnonymous(false)} className={clsx("m-press rounded-[20px] p-3 text-left", !isAnonymous ? selCls : "m-glass")}>
                <b className="block text-[14px] font-medium">Открыто</b>
                <span className="text-[11.5px] text-ink-400">Все видят твой профиль и место встречи</span>
              </button>
              <button onClick={() => setIsAnonymous(true)} className={clsx("m-press rounded-[20px] p-3 text-left", isAnonymous ? selCls : "m-glass")}>
                <b className="block text-[14px] font-medium">Анонимно</b>
                <span className="text-[11.5px] text-ink-400">Имя, фото и точный адрес увидят только те, чью заявку ты примешь</span>
              </button>
            </div>

            <span className="mb-1.5 mt-5 block px-1 text-[12.5px] font-medium text-ink-600">Так увидят встречу другие</span>
            <div className="pointer-events-none">
              <EventCard event={previewEvent} />
            </div>
          </>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#F6F2FF] via-[#F6F2FF]/90 to-transparent px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-6">
        {error && (
          <div role="alert" className="m-pop mb-2 rounded-[18px] bg-white/90 px-4 py-3 text-center text-sm font-medium text-[#D6336C] shadow-card">
            {error}
          </div>
        )}
        <button onClick={next} disabled={submitting} className={clsx("m-btn", stepIndex === 3 ? "m-btn-v" : "m-btn-k", h && "opacity-60")}>
          {stepIndex === 3 ? (submitting ? "Публикуем..." : "Опубликовать") : "Дальше"}
        </button>
      </div>

      {trainingSheet && (
        <div className="m-fade-in fixed inset-0 z-[60] flex flex-col justify-end bg-[rgba(22,18,31,0.35)]" onClick={() => setTrainingSheet(false)}>
          <div className="m-sheet-in m-glass-2 rounded-t-[30px] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <h2 className="m-title mb-4 text-[24px]">
              Совместная <span className="m-em">тренировка</span>
            </h2>
            <div className="m-stagger grid grid-cols-3 gap-2">
              {trainingTypes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTrainingTypeSlug(t.slug);
                    setTrainingSheet(false);
                  }}
                  className={clsx("m-cat", trainingTypeSlug === t.slug ? selCls : "bg-white/70 shadow-card")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={trainingIcon(t.slug)} alt="" />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {cropSrc && (
        <PhotoCropModal
          src={cropSrc}
          aspectRatio={1.4}
          onCancel={() => setCropSrc(undefined)}
          onConfirm={(dataUrl) => {
            setPhoto(dataUrl);
            setPhotoKind("own");
            setCropSrc(undefined);
          }}
        />
      )}
    </div>
  );
}

function Head({ title, em, sub }: { title: string; em: string; sub: string }) {
  return (
    <div className="m-stagger mb-4">
      <h1 className="m-title">
        {title} <span className="m-em">{em}</span>
      </h1>
      <p className="mt-1.5 text-[13.5px] leading-snug text-ink-600">{sub}</p>
    </div>
  );
}

/**
 * Три фирменные обложки, которые «рисует Мося»: градиент + большая
 * глянцевая 3D-иконка категории + мягкие блики. Рисуем в canvas и
 * отдаём JPEG — дальше обложка загружается как обычное фото встречи.
 */
const COVER_GRADIENTS: [string, string, string][] = [
  ["#6C3BFF", "#A24DFF", "#FF6FA0"],
  ["#3A2F8F", "#6C3BFF", "#5AA9FF"],
  ["#A24DFF", "#FF6FA0", "#FFB27A"],
];

async function drawCovers(iconSrc: string): Promise<string[]> {
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = iconSrc;
  });
  const W = 1120;
  const H = 800;
  return COVER_GRADIENTS.map(([a, b, c], k) => {
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");
    if (!ctx) return "";
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, a);
    g.addColorStop(0.5, b);
    g.addColorStop(1, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // мягкие блики
    const blobs: [number, number, number, string][] = [
      [W * 0.15, H * 0.2, 320, "rgba(255,255,255,.22)"],
      [W * 0.9, H * 0.95, 380, "rgba(255,255,255,.14)"],
      [W * 0.55, H * 0.55, 260, "rgba(255,255,255,.10)"],
    ];
    for (const [x, y, r, col] of blobs) {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, col);
      rg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }
    if (img) {
      const size = H * (k === 1 ? 0.95 : 0.82);
      ctx.save();
      ctx.translate(W * (k === 2 ? 0.36 : 0.66), H * 0.54);
      ctx.rotate(((k === 2 ? 10 : -10) * Math.PI) / 180);
      ctx.shadowColor = "rgba(40,10,90,.35)";
      ctx.shadowBlur = 50;
      ctx.shadowOffsetY = 26;
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
      if (k === 0) {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(img, W * 0.06, H * 0.58, H * 0.3, H * 0.3);
        ctx.globalAlpha = 1;
      }
    }
    return cv.toDataURL("image/jpeg", 0.86);
  });
}
