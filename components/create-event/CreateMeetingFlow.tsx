"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LocationPicker } from "@/components/map/LocationPicker";
import { searchAddress, type AddressSuggestion } from "@/lib/maps/forward-geocode";
import { getInitData } from "@/lib/telegram/webapp-client";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { businessProblem, descriptionProblem, titleProblem } from "@/lib/events/quality";
import { CATEGORY_ICON, trainingIcon } from "@/lib/data/category-icons";
import { coverFor, coverForText, coverSetFor, isPresetCover } from "@/lib/photos/preset-cover";
import { confetti } from "@/lib/mosya/confetti";
import { Ic, Toast } from "@/components/proto/ui";
import { KI, TwoLine } from "@/components/proto/k";
import { Creature } from "@/components/brand/Creature";
import { CalendarSheet, Wheel } from "@/components/proto/pickers";
import { ShareSheet } from "@/components/proto/ShareSheet";
import { PhotoCropModal } from "./PhotoCropModal";
import { goBack } from "@/lib/nav/back";
import { maxGroupSize, type Plan } from "@/lib/subscriptions/limits";
import { BIZ_SECTIONS, BIZ_KEYS, bizCategoryIcon } from "@/lib/events/biz-categories";
import { hasOrganizerPhoto } from "@/lib/events/organizer-photo";
import { getJson } from "@/lib/http/get-json";
import { OrganizerPhotoGate } from "./OrganizerPhotoGate";

/**
 * Создание встречи в 4 шага — разметка и анимации из прототипа (SCR.create):
 *   1. Что планируем — 8 категорий, вид тренировки, «Своё предложение»
 *   2. Название и обложка — обложки рисует Мося, можно своё фото
 *   3. Когда и где — колёса дня и времени, календарь, длительность, место
 *   4. Кто и сколько — люди, расходы, открыто/анонимно, превью карточки
 * Потом — «Встреча опубликована» и «Поделиться». На сервер уходят те же
 * поля, что и раньше (POST /api/events).
 */

interface Category {
  id: string;
  slug: string;
  name: string;
}
interface TrainingType {
  id: string;
  slug: string;
  name: string;
}

interface PlaceSuggestion {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  source: "yandex" | "osm" | "history" | "pick";
  rating?: number | null;
  reviews?: number | null;
  note?: string | null;
}
type CostType = "each_pays" | "organizer_treats" | "free" | "negotiable";

const COSTS: [CostType, string][] = [
  ["each_pays", "Каждый за себя"],
  ["organizer_treats", "Автор угощает"],
  ["free", "Без расходов"],
  ["negotiable", "По договорённости"],
];
/** Колесо «Сколько продлится» (как в прототипе): от 1 до 12 часов, шаг 30 минут. */
const DUR_WHEEL: [number, string][] = Array.from({ length: 23 }, (_, i) => {
  const m = 60 + i * 30;
  return [m, `${Math.floor(m / 60)}${m % 60 ? ",5" : ""} ч`];
});
const durIndex = (m: number) => {
  let best = 0;
  DUR_WHEEL.forEach(([v], i) => {
    if (Math.abs(v - m) < Math.abs(DUR_WHEEL[best]![0] - m)) best = i;
  });
  return best;
};
/** Подписи плиток — как в прототипе. */
const SHORT: Record<string, string> = {
  training: "Тренировка",
  cinema: "Кино",
  coffee: "Кофе",
  breakfast: "Завтрак",
  dinner: "Ужин",
  walk: "Прогулка",
  active: "Активный отдых",
  party: "Вечеринка",
};

const N_DAYS = 120;
const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const WDL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MS = ["янв", "февр", "марта", "апр", "мая", "июня", "июля", "авг", "сент", "окт", "нояб", "дек"];
const MG = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const pad2 = (n: number) => String(n).padStart(2, "0");

function dayDate(i: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + i);
  return d;
}
const DAYS = Array.from({ length: N_DAYS }, (_, i) => {
  const d = dayDate(i);
  const wd = WDL[d.getDay()] ?? "";
  return {
    iso: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    s: i === 0 ? "Сегодня" : i === 1 ? "Завтра" : `${WD[d.getDay()]}, ${d.getDate()} ${MS[d.getMonth()]}`,
    l: i === 0 ? `Сегодня, ${d.getDate()} ${MG[d.getMonth()]}` : i === 1 ? `Завтра, ${d.getDate()} ${MG[d.getMonth()]}` : `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${d.getDate()} ${MG[d.getMonth()]}`,
    chip: i === 0 ? "Сегодня" : i === 1 ? "Завтра" : `${WD[d.getDay()]}, ${d.getDate()}`,
  };
});
const HOURS = Array.from({ length: 24 }, (_, h) => String(h));
const MINS = Array.from({ length: 12 }, (_, m) => pad2(m * 5));

/** Фон-обложка плитки: фото во весь блок (data:URL и наши файлы — как есть). */
function bgCover(url?: string | null): React.CSSProperties {
  return url ? { backgroundImage: `url(${url})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "linear-gradient(160deg,#3A3646,#17141F)" };
}

/** Плитки дней (как в прототипе): неделя вперёд. */
const TILE_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function CreateMeetingFlow({ business: businessProp = false, editId }: { business?: boolean; editId?: string } = {}) {
  const [business, setBusiness] = useState(businessProp);
  const [minSeats, setMinSeats] = useState(1);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  // «Позвать на встречу» → «Новая встреча»: после публикации приглашение уходит само.
  const inviteUserId = searchParams.get("invite");
  const inviteName = searchParams.get("inviteName");
  const [invited, setInvited] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // «Что создаём?» — открытая, анонимная или событие для бизнеса. Пропускаем при правке,
  // «Найти компанию» из городской афиши и приглашении конкретного человека.
  const skipKind = !!editId || !!searchParams.get("fromCity") || !!inviteUserId;
  const [chosen, setChosen] = useState(skipKind);
  const [me, setMe] = useState<{ name: string; avatarUrl: string | null } | null>(null);
  const [profileState, setProfileState] = useState<"loading" | "ready" | "error">("loading");
  const [profileAttempt, setProfileAttempt] = useState(0);

  const [categorySlug, setCategorySlug] = useState<string | null>(searchParams.get("category"));
  const [trainingTypeSlug, setTrainingTypeSlug] = useState<string | null>(searchParams.get("type"));
  // Раздел бизнес-события (Бары, Вечеринки и клубы…) — обязателен, по нему фильтры «Для бизнеса».
  const [bizCategory, setBizCategory] = useState<string | null>(null);
  const [own, setOwn] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [ownPhoto, setOwnPhoto] = useState<string | undefined>();
  const [covers, setCovers] = useState<string[]>([]);
  const [coverShift, setCoverShift] = useState(0);
  const [cropSrc, setCropSrc] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);

  const [di, setDi] = useState(0);
  const [hh, setHh] = useState(() => Math.min(23, new Date().getHours() + 1));
  const [mi, setMi] = useState(0);
  const [calOpen, setCalOpen] = useState(false);
  const [duration, setDuration] = useState(120);
  const [placeName, setPlaceName] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [externalCoords, setExternalCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [recs, setRecs] = useState<PlaceSuggestion[]>([]);
  const [drop, setDrop] = useState<PlaceSuggestion[]>([]);
  const [addrDrop, setAddrDrop] = useState<AddressSuggestion[]>([]);

  const [seatsTotal, setSeatsTotal] = useState(3);
  // Тариф организатора — чтобы счётчик участников не давал вписать больше,
  // чем разрешает подписка (раньше можно было ввести до 500 на любом тарифе,
  // а отказ приходил только при публикации). Сервер проверяет то же самое.
  const [plan, setPlan] = useState<Plan | null>(null);
  // При редактировании уже сохранённое число не урезаем, даже если тариф сменился.
  const [savedSeats, setSavedSeats] = useState(0);
  const hardMax = business ? 500 : 30;
  const planMax = plan ? maxGroupSize(plan, business) : null;
  const seatsCap = Math.max(Math.min(hardMax, planMax ?? hardMax), savedSeats);
  useEffect(() => {
    setSeatsTotal((n) => Math.min(n, seatsCap));
  }, [seatsCap]);
  const [costType, setCostType] = useState<CostType>("each_pays");
  // Бизнес-событие: билет / бесплатно / свои условия (оплата — организатору лично).
  const [bizPricing, setBizPricing] = useState<"ticket" | "free" | "custom">("ticket");
  const [ticketPrice, setTicketPrice] = useState("");
  const [bizTerms, setBizTerms] = useState("");
  // «Анонимно по умолчанию» из настроек приватности.
  const [isAnonymous, setIsAnonymous] = useState(false);
  useEffect(() => {
    try {
      if (!editId && localStorage.getItem("mesto_anon_default") === "1") setIsAnonymous(true);
    } catch {
      /* нет хранилища */
    }
  }, []);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories ?? []);
        setTrainingTypes(data.trainingTypes ?? []);
      })
      .catch(() => {});
    fetch("/api/subscriptions")
      .then((r) => r.json())
      .then((d) => {
        if (d?.active && (d.plan === "start" || d.plan === "medium" || d.plan === "premium")) setPlan(d.plan);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setProfileState("loading");
    getJson<{ name?: string; avatarUrl: string | null }>("/api/me/profile", controller.signal)
      .then((d) => {
        if (controller.signal.aborted) return;
        if (!d || !("avatarUrl" in d)) throw new Error("Invalid profile response");
        setMe({ name: d.name ?? "Ты", avatarUrl: d.avatarUrl });
        setProfileState("ready");
      })
      .catch(() => { if (!controller.signal.aborted) setProfileState("error"); });
    return () => controller.abort();
  }, [profileAttempt]);

  // «Найти компанию» на событие из городской афиши — подставляем название, дату и место.
  const fromCity = searchParams.get("fromCity");
  useEffect(() => {
    if (!fromCity || editId) return;
    fetch(`/api/city-events/${fromCity}`)
      .then((r) => r.json())
      .then((c) => {
        if (c.error) return;
        setTitle(`Пойдём вместе: ${c.title}`.slice(0, 80));
        const d = new Date(`${c.eventDate}T00:00:00`);
        const t0 = new Date();
        t0.setHours(0, 0, 0, 0);
        const days = Math.round((d.getTime() - t0.getTime()) / 864e5);
        if (days >= 0) setDi(Math.min(N_DAYS - 1, days));
        if (c.eventTime) {
          const [h = 19, m = 0] = String(c.eventTime).split(":").map(Number);
          setHh(h);
          setMi(Math.round(m / 5) % 12);
        }
        if (c.placeName) setPlaceName(c.placeName);
        if (c.address) setAddress(c.address);
        if (c.latitude != null && c.longitude != null) {
          setLatitude(c.latitude);
          setLongitude(c.longitude);
          setExternalCoords({ latitude: c.latitude, longitude: c.longitude });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCity]);

  // Правка встречи: заполняем шаги данными с сервера.
  useEffect(() => {
    if (!editId) return;
    fetch(`/api/events/${editId}`)
      .then((r) => r.json())
      .then((e) => {
        if (e.error) return;
        setBusiness(!!e.isBusiness);
        setCategorySlug(e.category?.slug ?? null);
        if (e.bizCategory && BIZ_KEYS.has(e.bizCategory)) setBizCategory(e.bizCategory);
        if (e.bizCategory === "other") setOwn(String(e.title ?? "").slice(0, 30));
        setTrainingTypeSlug(e.trainingType?.slug ?? null);
        setTitle(e.title ?? "");
        // Бизнес-события и «Своё» хранятся с категорией custom: без этого слова
        // правка застревала на первом шаге («Напиши одним-двумя словами…»).
        if ((e.category?.slug ?? "") === "custom") setOwn(String(e.title ?? "").slice(0, 30));
        setDescription(e.description ?? "");
        if (e.photoUrl) {
          setOwnPhoto(e.photoUrl);
          setPhoto(e.photoUrl);
        }
        const d = new Date(e.eventDate);
        const t0 = new Date();
        t0.setHours(0, 0, 0, 0);
        setDi(Math.max(0, Math.min(N_DAYS - 1, Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - t0.getTime()) / 864e5))));
        const [h = 19, m = 0] = String(e.eventTime ?? "19:00").split(":").map(Number);
        setHh(h);
        setMi(Math.round(m / 5) % 12);
        if (e.eventEndTime) {
          const [eh = 0, em = 0] = String(e.eventEndTime).split(":").map(Number);
          const dur = (eh * 60 + em - (h * 60 + m) + 1440) % 1440 || 120;
          setDuration(dur);
        }
        setPlaceName(e.placeName ?? "");
        setAddress(e.address ?? "");
        if (e.latitude != null && e.longitude != null) {
          setLatitude(e.latitude);
          setLongitude(e.longitude);
          setExternalCoords({ latitude: e.latitude, longitude: e.longitude });
        }
        setSeatsTotal(e.seatsTotal ?? 3);
        setSavedSeats(e.seatsTotal ?? 0);
        setMinSeats(Math.max(1, e.seatsTaken ?? 1));
        if (e.costType) setCostType(e.costType);
        setIsAnonymous(!!e.isAnonymous);
        if (e.businessPricingType) setBizPricing(e.businessPricingType);
        if (e.businessPricingType === "ticket") setTicketPrice(String(e.businessPricingDetails ?? "").replace(/[^\d]/g, ""));
        if (e.businessPricingType === "custom") setBizTerms(e.businessPricingDetails ?? "");
      })
      .catch(() => {});
  }, [editId]);


  const isOwn = !business && categorySlug === "custom";
  const bizSection = business ? BIZ_SECTIONS.find((c) => c.key === bizCategory) ?? null : null;
  const iconSrc = bizSection
    ? bizCategoryIcon(bizSection)
    : categorySlug === "training" ? trainingIcon(trainingTypeSlug) : isOwn ? "/brand/pi/other.svg" : (categorySlug && CATEGORY_ICON[categorySlug]) || CATEGORY_ICON.custom || "";
  const catLabel = bizSection
    ? bizSection.key === "other" && own.trim() ? own.trim() : bizSection.label
    : categorySlug === "training"
      ? trainingTypes.find((t) => t.slug === trainingTypeSlug)?.name ?? "Тренировка"
      : isOwn
        ? own || "Своё"
        : (categorySlug && SHORT[categorySlug]) || "встречи";

  // Готовая фотообложка под категорию (Nano Banana). Для «Своё» Мося
  // подбирает её по словам организатора; не подошло — нужно своё фото.
  const presetCover = isOwn ? coverForText(`${own} ${title}`) : coverFor(categorySlug, trainingTypeSlug, business);

  // Обложки от Моси — готовое фото категории; рисованные — только запасной вариант.
  useEffect(() => {
    if (step !== 2) return;
    // Событие для бизнеса — только своё фото (афиша, зал, сцена), без наших обложек.
    if (business || (isOwn && !presetCover)) {
      setCovers([]);
      if (photo !== ownPhoto) setPhoto(ownPhoto);
      return;
    }
    if (presetCover) {
      // Бег, кино, Hyrox — фирменный набор на выбор; остальные — одна обложка раздела.
      const set = isOwn ? [] : coverSetFor(categorySlug, trainingTypeSlug, business);
      const list = set.length ? set : [presetCover];
      setCovers(list);
      if (!ownPhoto && (!photo || !list.includes(photo))) setPhoto(list[0]!);
      return;
    }
    if (!iconSrc) return;
    let cancelled = false;
    setCovers([]);
    drawCovers(iconSrc, coverShift).then((list) => {
      if (cancelled) return;
      setCovers(list);
      if (!ownPhoto && (!photo || photo !== ownPhoto)) setPhoto(list[0]);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, iconSrc, coverShift, presetCover, isOwn]);

  // «Мося рекомендует» — места под категорию (кинотеатры для «Кино»…).
  useEffect(() => {
    if (step !== 3) return;
    const p = new URLSearchParams();
    if (categorySlug) p.set("category", categorySlug);
    if (trainingTypeSlug) p.set("type", trainingTypeSlug);
    fetch(`/api/places?${p}`)
      .then((r) => r.json())
      .then((d) => setRecs(Array.isArray(d.items) ? d.items.slice(0, 10) : []))
      .catch(() => setRecs([]));
  }, [step, categorySlug, trainingTypeSlug]);

  // Поиск по набранному: места (подсказки) + адреса (геокодер).
  useEffect(() => {
    const q = placeQuery.trim();
    if (q.length < 2) {
      setDrop([]);
      setAddrDrop([]);
      return;
    }
    const t = setTimeout(() => {
      const p = new URLSearchParams({ q });
      if (categorySlug) p.set("category", categorySlug);
      fetch(`/api/places?${p}`)
        .then((r) => r.json())
        .then((d) => setDrop(Array.isArray(d.items) ? d.items.slice(0, 4) : []))
        .catch(() => setDrop([]));
      if (q.length >= 3) searchAddress(q).then((a) => setAddrDrop(a.slice(0, 3)));
    }, 300);
    return () => clearTimeout(t);
  }, [placeQuery, categorySlug]);

  function pickPlace(p: { name: string; address: string; latitude: number; longitude: number }) {
    setPlaceName(p.name);
    setAddress(p.address);
    setLatitude(p.latitude);
    setLongitude(p.longitude);
    setExternalCoords({ latitude: p.latitude, longitude: p.longitude });
    setPlaceQuery("");
    setDrop([]);
    setAddrDrop([]);
  }

  function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  const eventDate = DAYS[di]?.iso ?? DAYS[0]!.iso;
  const eventTime = `${pad2(hh)}:${pad2(mi * 5)}`;
  const endMin = (hh * 60 + mi * 5 + duration) % 1440;
  const eventEndTime = `${pad2(Math.floor(endMin / 60))}:${pad2(endMin % 60)}`;
  const sumTxt = `${DAYS[di]?.l}, ${hh}:${pad2(mi * 5)}–${Math.floor(endMin / 60)}:${pad2(endMin % 60)}`;

  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(null), 2600);
  }

  function problem(): string | null {
    if (step === 1 && business) {
      if (!bizCategory) return "Без раздела дальше не пущу 😉 Если не уверен — выбери самое близкое, поменять можно потом.";
      if (bizCategory === "other" && own.trim().length < 2) return "Напиши одним-двумя словами, что за событие — например «дегустация». Так его найдут поиском";
    } else if (step === 1) {
      if (!categorySlug) return "Выбери, что планируешь.";
      if (categorySlug === "training" && !trainingTypeSlug) return "Выбери вид тренировки.";
      if (isOwn && own.trim().length < 2) return "Напиши одним-двумя словами, чем займёмся — например «сапы». Так встречу найдут поиском";
    }
    if (step === 2) {
      const t = titleProblem(title);
      if (t) return t;
      const fullDesc = [(isOwn || (business && bizCategory === "other")) && own.trim() && !title.toLowerCase().includes(own.trim().toLowerCase()) ? own.trim() : "", description].filter(Boolean).join(". ");
      const d = descriptionProblem(fullDesc);
      if (d) return d;
      // Мастер-классы и платные занятия — только через «Для бизнеса».
      if (!business) {
        const b = businessProblem(title, fullDesc);
        if (b) return b;
      }
    }
    if (step === 2 && business && (!ownPhoto || photo !== ownPhoto))
      return "Загрузи фото события — афишу, зал или сцену. Так гости поймут, куда идут.";
    if (step === 2 && isOwn && !presetCover && !isPresetCover(photo) && (!ownPhoto || photo !== ownPhoto))
      return "Мося не нашёл обложку под твою встречу — загрузи своё фото, чтобы люди поняли, куда зовёшь.";
    if (step === 3) {
      if (duration < 60) return "Встреча должна длиться хотя бы час.";
      if (placeName.trim().length < 2 || latitude === undefined || longitude === undefined) return "Выбери место из подсказок или отметь точку на карте.";
    }
    if (step === 4 && seatsTotal < 1) return "Нужен хотя бы 1 человек кроме тебя.";
    if (step === 4 && business && bizPricing === "ticket" && !ticketPrice.trim()) return "Укажи цену билета.";
    if (step === 4 && business && bizPricing === "custom" && !bizTerms.trim()) return "Опиши условия участия.";
    return null;
  }

  function next() {
    const h = problem();
    if (h) {
      flash(h);
      return;
    }
    if (step === 1 && (isOwn || (business && bizCategory === "other")) && !title) setTitle(own.trim());
    if (step < 4) {
      setDir(1);
      setStep(step + 1);
    } else publish();
  }
  function back() {
    if (step > 1) {
      setDir(-1);
      setStep(step - 1);
    } else if (chosen && !skipKind) {
      setDir(-1);
      setChosen(false);
    } else goBack(router, "/feed");
  }

  type Kind = "open" | "anon" | "business";
  const kind: Kind = business ? "business" : isAnonymous ? "anon" : "open";
  function pickKind(k: Kind) {
    setBusiness(k === "business");
    setIsAnonymous(k === "anon");
    setDir(1);
    setTimeout(() => setChosen(true), 220);
  }

  async function publish() {
    setSubmitting(true);
    if (!getInitData()) {
      flash("Открой приложение через Telegram.");
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch(editId ? `/api/events/${editId}` : "/api/events", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editId ? { action: "update" } : {}),
          categorySlug: business ? undefined : categorySlug,
          bizCategory: business ? bizCategory ?? undefined : undefined,
          trainingTypeSlug: trainingTypeSlug ?? undefined,
          placeName,
          address,
          latitude,
          longitude,
          eventDate,
          eventTime,
          eventEndTime,
          seatsTotal,
          costType: business ? undefined : costType,
          businessPricingType: business ? bizPricing : undefined,
          businessPricingDetails: business ? (bizPricing === "ticket" ? `${ticketPrice.trim()} ₽` : bizPricing === "custom" ? bizTerms.trim() : undefined) : undefined,
          title: title.trim(),
          description: [(isOwn || (business && bizCategory === "other")) && own.trim() && !title.toLowerCase().includes(own.trim().toLowerCase()) ? own.trim() : "", description]
            .filter(Boolean)
            .join(". "),
          isBusiness: business,
          isAnonymous: business ? false : isAnonymous,
          // при правке фото отправляем, только если его поменяли (новый data:URL)
          photoBase64: editId ? (photo?.startsWith("data:") || isPresetCover(photo) ? photo : undefined) : photo,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "profile_photo_required") {
          setMe((p) => ({ name: p?.name ?? "Ты", avatarUrl: null }));
          setProfileState("ready");
        }
        const map: Record<string, number> = {
          categorySlug: 1,
          bizCategory: 1,
          trainingTypeSlug: 1,
          title: 2,
          description: 2,
          photoBase64: 2,
          placeName: 3,
          address: 3,
          latitude: 3,
          longitude: 3,
          eventDate: 3,
          eventTime: 3,
          eventEndTime: 3,
        };
        const target = typeof data.field === "string" ? map[data.field] : undefined;
        if (target) {
          setDir(-1);
          setStep(target);
        }
        flash(apiErrorText(data, "Не получилось опубликовать встречу. Попробуй ещё раз.", res.status));
        setSubmitting(false);
        return;
      }
      if (editId) {
        router.push(`/events/${editId}`);
        return;
      }
      confetti();
      setPublishedId(data.eventId as string);
      if (inviteUserId) {
        const ok = await fetch("/api/conversations/direct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: inviteUserId, eventId: data.eventId }),
        })
          .then((r) => r.ok)
          .catch(() => false);
        setInvited(ok);
      }
    } catch {
      flash("Проблема с соединением.");
      setSubmitting(false);
    }
  }


  /* ---------- опубликовано ---------- */
  if (!editId && !publishedId && chosen && kind !== "anon" && (profileState !== "ready" || !hasOrganizerPhoto(me?.avatarUrl))) {
    return <OrganizerPhotoGate
      loading={profileState === "loading"}
      error={profileState === "error"}
      onRetry={() => setProfileAttempt((n) => n + 1)}
      onBack={() => { if (!skipKind) setChosen(false); else goBack(router, "/feed"); }}
      onUploaded={(avatarUrl) => { setMe((p) => ({ name: p?.name ?? "Ты", avatarUrl })); setProfileState("ready"); }}
    />;
  }

  if (publishedId) {
    // «Встреча опубликована» — как в прототипе: живой Мося, «Поделиться», «В популярное», «Мои встречи».
    return (
      <section className="scr aurora up" data-id="published">
        <div className="scroll" style={{ paddingBottom: 200 }}>
          <div className="k-done" style={{ display: "grid", justifyItems: "center", textAlign: "center", paddingTop: "12vh" }}>
            <Creature size={220} variant="e" />
            <h1 className="k-h1" style={{ marginTop: 26, textAlign: "center" }}>
              Встреча
              <br />
              <em>опубликована</em>
            </h1>
            <p className="k-sub2" style={{ maxWidth: 320, textAlign: "center" }}>
              {invited && inviteName ? `Приглашение для ${inviteName} уже отправлено. ` : ""}
              {isAnonymous
                ? "Встреча анонимная: имя, фото и адрес увидят только те, кого ты примешь."
                : "Подписчики и люди рядом увидят её первыми. Заявки придут в «Мои встречи»."}
            </p>
          </div>
        </div>
        <div className="foot" style={{ display: "grid", gap: 10 }}>
          <button className="k-btn k-d k-pr" onClick={() => setShareOpen(true)}>
            <KI n="share" />
            Поделиться
          </button>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button className="k-btn k-l k-pr" onClick={() => router.push(`/events/${publishedId}?promote=1`)}>
              <KI n="spark" />В популярное
            </button>
            <button className="k-btn k-l k-pr" onClick={() => router.push("/my-events")}>
              Мои встречи
            </button>
          </div>
        </div>
        <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} eventId={publishedId} title={title} when={sumTxt} version={photo ?? ""} />
      </section>
    );
  }

  const cats = categories.filter((c) => c.slug !== "custom");
  const hasCustom = categories.some((c) => c.slug === "custom");
  // Наши обложки — только для своего раздела встречи; у бизнеса — только своё фото.
  const gridCovers = business ? [] : !isOwn || presetCover ? covers : [];
  const planName = plan === "medium" ? "Медиум" : plan === "premium" ? "Премиум" : "Старт";
  const srcLabel = (src?: string) => (src === "yandex" ? "Яндекс" : src === "osm" ? "Карты" : "");
  const costLabel = business
    ? bizPricing === "ticket"
      ? ticketPrice
        ? `${ticketPrice} ₽`
        : "Билет"
      : bizPricing === "free"
        ? "Бесплатно"
        : "Свои условия"
    : COSTS.find(([v]) => v === costType)?.[1] ?? "";

  return (
    <section className="scr cr aurora up" data-id="create">
      <div className="scroll" style={{ paddingBottom: 150 }}>
        <div className="k-top">
          <button className="k-rb k-g k-pr" onClick={back} aria-label={step > 1 || (chosen && !skipKind) ? "Назад" : "Закрыть"}>
            <KI n={step > 1 || (chosen && !skipKind) ? "back" : "x"} />
          </button>
          <div className="k-wprog">
            {[1, 2, 3, 4].map((i) => (
              <i key={i} className={chosen && i <= step ? "k-on" : ""} />
            ))}
          </div>
        </div>

        <div key={chosen ? step : 0} className={`k-wst ${dir < 0 ? "k-back" : ""}`}>
          {!chosen && (
            <>
              <h1 className="k-h1">
                Что <em>создаём</em>?
              </h1>
              <p className="k-sub2">Выбери формат — дальше всё подскажу по шагам.</p>
              <div className="k-opts">
                {(
                  [
                    ["open", "", "Открытая встреча", "Кофе, спорт, кино, прогулка — все видят тебя и место встречи"],
                    ["anon", "k-t2", "Анонимная встреча", "Имя, фото и точный адрес увидят только те, чью заявку ты примешь"],
                    ["business", "k-t3", "Событие для бизнеса", "Афиша для заведения или своего дела: концерт, квиз, мастер‑класс. Гостей до 500, можно билеты"],
                  ] as [Kind, string, string, string][]
                ).map(([k, tint, name, text]) => (
                  <button key={k} className={`k-own k-opt3 k-g k-pr ${kind === k ? "k-on" : ""}`} onClick={() => pickKind(k)}>
                    <span className={`k-crw ${tint}`}>
                      <Creature size={86} variant={k === "anon" ? "p" : "e"} />
                    </span>
                    <span>
                      <b>{name}</b>
                      <small>{text}</small>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {chosen && step === 1 && (
            <>
              <h1 className="k-h1">{business ? <>Куда <em>зовёшь</em>?</> : <>Что <em>планируем</em>?</>}</h1>
              <p className="k-sub2">
                {business
                  ? "Выбери раздел — в нём гости найдут событие в «Для бизнеса». Название напишешь на следующем шаге."
                  : "Выбери, во что будет встреча. Так её найдут люди с похожими интересами."}
              </p>
              {business ? (
                <div className="k-cats">
                  {BIZ_SECTIONS.filter((c) => c.key !== "other").map((c) => (
                    <button key={c.key} className={`k-cat k-g k-pr ${bizCategory === c.key ? "k-on" : ""}`} onClick={() => setBizCategory(c.key)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={bizCategoryIcon(c)} alt="" />
                      {c.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {business && (
                <>
                  <button className={`k-own k-g k-pr ${bizCategory === "other" ? "k-on" : ""}`} onClick={() => setBizCategory("other")}>
                    <span className="k-op">
                      <KI n="plusp" />
                    </span>
                    <span>
                      <b>Свой раздел</b>
                      <small>Нет подходящего? Напиши сам — дегустация, фестиваль, ярмарка</small>
                    </span>
                  </button>
                  {bizCategory === "other" && (
                    <label className="k-field k-g" style={{ marginTop: 8 }}>
                      <input autoFocus value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Например: дегустация, фестиваль" maxLength={30} />
                      <span className="k-cnt2">{own.length}/30</span>
                    </label>
                  )}
                </>
              )}
              {!business && (
                <div className="k-cats">
                  {cats.map((c) => (
                    <button
                      key={c.id}
                      className={`k-cat k-g k-pr ${categorySlug === c.slug ? "k-on" : ""}`}
                      onClick={() => {
                        setCategorySlug(c.slug);
                        if (c.slug !== "training") setTrainingTypeSlug(null);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={CATEGORY_ICON[c.slug] ?? CATEGORY_ICON.custom} alt="" />
                      {SHORT[c.slug] ?? c.name}
                    </button>
                  ))}
                </div>
              )}
              {!business && categorySlug === "training" && (
                <>
                  <span className="k-lbl">Какая тренировка?</span>
                  <div className="k-cats" style={{ marginTop: 0 }}>
                    {trainingTypes.map((t) => (
                      <button key={t.id} className={`k-cat k-g k-pr ${trainingTypeSlug === t.slug ? "k-on" : ""}`} onClick={() => setTrainingTypeSlug(t.slug)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={trainingIcon(t.slug)} alt="" />
                        {t.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {!business && hasCustom && (
                <button
                  className={`k-own k-g k-pr ${isOwn ? "k-on" : ""}`}
                  onClick={() => {
                    setCategorySlug("custom");
                    setTrainingTypeSlug(null);
                  }}
                >
                  <span className="k-op">
                    <KI n="plusp" />
                  </span>
                  <span>
                    <b>Своё предложение</b>
                    <small>Не нашёл подходящего? Придумай сам — от сапов до вязания</small>
                  </span>
                </button>
              )}
              {isOwn && (
                <label className="k-field k-g" style={{ marginTop: 8 }}>
                  <input autoFocus value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Например: сапы, вязание, бадминтон" maxLength={30} />
                  <span className="k-cnt2">{own.length}/30</span>
                </label>
              )}
            </>
          )}

          {chosen && step === 2 && (
            <>
              <h1 className="k-h1">
                Название <em>и обложка</em>
              </h1>
              <p className="k-sub2">Короткое название и картинка решают, придут ли люди.</p>
              <span className="k-lbl">Название</span>
              <label className="k-field k-g">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={business ? "Например, дегустация вин от сомелье" : "Например, кофе перед работой"} maxLength={100} />
              </label>
              <span className="k-lbl">Описание</span>
              <label className="k-field k-g k-ta">
                <textarea rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Что будем делать, как узнать друг друга" />
              </label>
              <span className="k-lbl">Обложка</span>
              <p className="k-cvn">
                {business
                  ? "Загрузи своё фото — афишу, зал или сцену. Вертикально, 3:4"
                  : isOwn && !presetCover
                    ? `Под «${own.trim() || title.trim() || "твою встречу"}» готовой обложки нет — загрузи своё фото`
                    : gridCovers.length > 1
                      ? `Обложки для «${catLabel}» · выбери одну или загрузи своё фото`
                      : "Обложку подобрал Мося · или загрузи своё фото"}
              </p>
              <div className="k-cvg">
                {gridCovers.length === 0 && !business && (!isOwn || presetCover) && [0, 1, 2].map((i) => <div key={i} className="sk" style={{ aspectRatio: "3 / 4", borderRadius: 16 }} />)}
                {gridCovers.map((c, i) => (
                  <button key={c.slice(-40) + i} className={`k-pr ${photo === c ? "k-on" : ""}`} style={bgCover(c)} onClick={() => setPhoto(c)} aria-label={`Обложка ${i + 1}`} />
                ))}
                {ownPhoto && <button className={`k-pr ${photo === ownPhoto ? "k-on" : ""}`} style={bgCover(ownPhoto)} onClick={() => setPhoto(ownPhoto)} aria-label="Своё фото" />}
                <button className="k-pr k-cvown" onClick={() => fileRef.current?.click()}>
                  +<small>Своё фото</small>
                </button>
              </div>
              {!business && !isOwn && !presetCover && (
                <button className="k-btn k-l k-pr k-cropb" onClick={() => setCoverShift((n) => n + 1)}>
                  Ещё варианты
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePhoto} />
            </>
          )}

          {chosen && step === 3 && (
            <>
              <h1 className="k-h1">
                Когда <em>и где</em>?
              </h1>
              <p className="k-sub2">Выбери день и время — дальше место.</p>
              <div className="k-dates">
                {[...TILE_DAYS, ...(TILE_DAYS.includes(di) ? [] : [di])].map((i) => {
                  const d = dayDate(i);
                  return (
                    <button key={i} className={`k-dp k-g k-pr ${di === i ? "k-on" : ""}`} onClick={() => setDi(i)}>
                      <small>{i === 0 ? "Сегодня" : WD[d.getDay()]}</small>
                      <b>{d.getDate()}</b>
                    </button>
                  );
                })}
              </div>
              <button className="k-calb k-g k-pr" onClick={() => setCalOpen(true)}>
                <KI n="cal" />
                Выбрать в календаре
              </button>
              <div className="k-whrow">
                <div>
                  <span className="k-lbl">Начало</span>
                  <div className="k-wheels2">
                    <div className="k-wheel k-g">
                      <Wheel items={HOURS} index={hh} onChange={setHh} />
                    </div>
                    <b className="k-colon">:</b>
                    <div className="k-wheel k-g">
                      <Wheel items={MINS} index={mi} onChange={setMi} />
                    </div>
                  </div>
                </div>
                <div>
                  <span className="k-lbl">Сколько продлится</span>
                  <div className="k-wheel k-g k-wide">
                    <Wheel items={DUR_WHEEL.map(([, t]) => t)} index={durIndex(duration)} onChange={(i) => setDuration(DUR_WHEEL[i]![0])} />
                  </div>
                </div>
              </div>

              <span className="k-lbl">Место</span>
              {recs.length > 0 && (
                <>
                  <div className="k-recp">
                    {recs.slice(0, 3).map((p) => (
                      <button key={p.name} className={`k-rp k-g k-pr ${placeName === p.name ? "k-on" : ""}`} onClick={() => pickPlace(p)}>
                        <i aria-hidden />
                        <span>
                          <b>{p.name}</b>
                          <small>{p.address || "отметим на карте"}</small>
                        </span>
                        {p.rating ? (
                          <span className="k-rt">
                            ★ {p.rating.toFixed(1).replace(".", ",")}
                            {srcLabel(p.source) && <small>{srcLabel(p.source)}</small>}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  <small className="k-rpn">Лучшие по рейтингу для «{catLabel}» · или найди своё</small>
                </>
              )}
              <label className="k-field k-g" style={{ marginTop: 8 }}>
                <KI n="search" />
                <input value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} placeholder="Название места или адрес" autoComplete="off" />
              </label>
              {placeQuery.trim().length >= 2 && (
                <div className="k-sugg k-g">
                  {drop.map((p) => (
                    <button key={"p" + p.name + p.address} className="k-pr" onClick={() => pickPlace(p)}>
                      <b>{p.name}</b>
                      <span>{p.address}</span>
                    </button>
                  ))}
                  {addrDrop.map((a) => (
                    <button key={"a" + a.address} className="k-pr" onClick={() => pickPlace({ name: placeQuery.trim(), address: a.address, latitude: a.latitude, longitude: a.longitude })}>
                      <b>{a.address.split(",")[0]}</b>
                      <span>{a.address}</span>
                    </button>
                  ))}
                  {drop.length === 0 && addrDrop.length === 0 && (
                    <button className="k-pr" disabled>
                      <span>Ищем… или нажми на карту — адрес определится сам</span>
                    </button>
                  )}
                </div>
              )}
              <div className="k-mapbox k-g" style={{ height: 200 }}>
                <LocationPicker
                  onPick={({ latitude: la, longitude: lo }) => {
                    setLatitude(la);
                    setLongitude(lo);
                    if (!placeName) setPlaceName("Точка на карте");
                  }}
                  onAddressResolved={(resolved) => setAddress(resolved)}
                  externalCoords={externalCoords}
                  heightPx={200}
                />
              </div>
              <div className="k-addr k-g">
                <span>
                  <b>{placeName || "Отметь точку на карте"}</b>
                  <small>{address || "или выбери из подсказок"}</small>
                </span>
                {address && (
                  <button className="k-rb k-g k-pr" onClick={() => navigator.clipboard?.writeText(address).then(() => flash("Адрес скопирован"), () => {})} aria-label="Скопировать адрес">
                    <Ic n="copy" c="xs" />
                  </button>
                )}
              </div>
            </>
          )}

          {chosen && step === 4 && (
            <>
              <h1 className="k-h1">
                Кто <em>и сколько</em>?
              </h1>
              <p className="k-sub2">Все приходят по заявке — ты сам решаешь, кого принять.</p>
              <span className="k-lbl">Сколько человек ищешь</span>
              <div className="k-bigst k-g">
                <button
                  className="k-rb k-g k-pr"
                  onClick={() => {
                    if (seatsTotal <= minSeats && editId) flash(`Меньше ${minSeats} нельзя — уже подтверждены`);
                    setSeatsTotal((n) => Math.max(minSeats, n - 1));
                  }}
                  aria-label="Меньше"
                >
                  –
                </button>
                <b key={seatsTotal} className="bump">
                  {seatsTotal}
                </b>
                <button
                  className="k-rb k-g k-pr"
                  onClick={() => {
                    if (seatsTotal >= seatsCap) flash(`На твоём тарифе — максимум ${seatsCap}`);
                    setSeatsTotal((n) => Math.min(seatsCap, n + 1));
                  }}
                  aria-label="Больше"
                >
                  +
                </button>
              </div>
              <p className="k-sub2" style={{ marginTop: 6, textAlign: "center" }}>
                {business
                  ? seatsTotal > 20
                    ? "Больше 20 гостей — общий чат не создаётся, только заявки"
                    : `Гостей на событии: ${seatsTotal}`
                  : `Не считая тебя · на встрече будет ${seatsTotal + 1} чел.`}
              </p>
              <button className="k-plan k-g k-pr" onClick={() => router.push("/subscriptions")}>
                <span>
                  <b>
                    Подписка {planName} · {business ? "гостей" : "группа"} до {planMax ?? hardMax}
                  </b>
                  <small>{business ? "Медиум — до 100, Премиум — без ограничений" : "Медиум — до 10, Премиум — до 30 человек"}</small>
                </span>
                <span className="k-chip k-g" style={{ height: 30, fontSize: 12 }}>
                  Тарифы
                </span>
              </button>
              <span className="k-lbl">{business ? "Стоимость" : "Как насчёт расходов?"}</span>
              {business ? (
                <>
                  <div className="k-hs" style={{ gap: 6, marginTop: 0 }}>
                    {(
                      [
                        ["ticket", "Билет"],
                        ["free", "Бесплатно"],
                        ["custom", "Другие условия"],
                      ] as const
                    ).map(([v, t]) => (
                      <button key={v} className={`k-chip k-g k-pr ${bizPricing === v ? "k-on" : ""}`} onClick={() => setBizPricing(v)}>
                        {t}
                      </button>
                    ))}
                  </div>
                  {bizPricing === "ticket" && (
                    <>
                      <label className="k-field k-g" style={{ marginTop: 8 }}>
                        <input value={ticketPrice} onChange={(e) => setTicketPrice(e.target.value.replace(/[^\d]/g, "").slice(0, 6))} placeholder="Цена билета, например 800" inputMode="numeric" />
                        <span className="k-cnt2">₽</span>
                      </label>
                      <p className="k-sub2" style={{ marginTop: 6 }}>
                        Гости платят тебе лично — на месте или переводом. После одобрения заявки гость получит номер билета.
                      </p>
                    </>
                  )}
                  {bizPricing === "custom" && (
                    <label className="k-field k-g k-ta" style={{ marginTop: 8 }}>
                      <textarea rows={2} maxLength={300} value={bizTerms} onChange={(e) => setBizTerms(e.target.value)} placeholder="Например: депозит 1000 ₽ на баре" />
                    </label>
                  )}
                </>
              ) : (
                <div className="k-hs" style={{ gap: 6, marginTop: 0 }}>
                  {COSTS.map(([v, t]) => (
                    <button key={v} className={`k-chip k-g k-pr ${costType === v ? "k-on" : ""}`} onClick={() => setCostType(v)}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
              {!business && skipKind && (
                <>
                  <span className="k-lbl">Настройки встречи</span>
                  <button className="k-tg2 k-g k-pr" onClick={() => setIsAnonymous(!isAnonymous)}>
                    <span className="k-tgt">
                      <b>Анонимная встреча</b>
                      <small>Имя, фото и адрес — только тем, кого примешь</small>
                    </span>
                    <span className={`k-sw2 ${isAnonymous ? "k-on" : ""}`} />
                  </button>
                </>
              )}
              <span className="k-lbl">Так увидят другие</span>
              <div className="k-prev" style={bgCover(photo)}>
                <span className="k-chip k-gw" style={{ top: 14, left: 14, height: 30, fontSize: 12 }}>
                  0 из {seatsTotal} · {catLabel.toLowerCase()}
                </span>
                <span style={{ left: 18, right: 18, bottom: 18 }}>
                  <span style={{ display: "block", font: "300 30px/1.05 var(--disp)", letterSpacing: "-.03em" }}>
                    <TwoLine text={title || own || "Моя встреча"} />
                  </span>
                  <span style={{ display: "block", font: "400 13px var(--disp)", opacity: 0.85, marginTop: 6 }}>
                    {DAYS[di]?.s}, {hh}:{pad2(mi * 5)} · {isAnonymous ? "место после одобрения" : placeName || "место"} · {costLabel}
                  </span>
                </span>
              </div>
              <p className="k-sub2" style={{ marginTop: 8 }}>
                {isAnonymous ? "На карте — Мося вместо фото, точный адрес скрыт" : "На карте — твоё фото на метке"}
              </p>
            </>
          )}
        </div>
      </div>
      {chosen && (
        <div className="foot">
          <button className="k-btn k-d k-pr" onClick={next} disabled={submitting}>
            {step === 4 ? (submitting ? (editId ? "Сохраняем…" : "Публикуем…") : editId ? "Сохранить изменения" : "Опубликовать") : "Далее"}
          </button>
        </div>
      )}

      <CalendarSheet open={calOpen} onClose={() => setCalOpen(false)} dayIndex={di} maxDays={N_DAYS} onPick={(i) => setDi(i)} />
      <Toast text={toast} />
      {cropSrc && (
        <PhotoCropModal
          src={cropSrc}
          aspectRatio={3 / 4}
          title="Обложка встречи"
          hint="Двигай фото пальцем, двумя пальцами — приблизить. Так обложка будет выглядеть на карточке"
          preview={{ title }}
          onReplace={() => fileRef.current?.click()}
          onCancel={() => setCropSrc(undefined)}
          onConfirm={(dataUrl) => {
            setOwnPhoto(dataUrl);
            setPhoto(dataUrl);
            setCropSrc(undefined);
          }}
        />
      )}
    </section>
  );
}

/**
 * Обложки, которые «рисует Мося»: фон в фирменной гамме (пастельный, как
 * .gfx прототипа, и два насыщенных градиента) + большая глянцевая
 * 3D-иконка категории. Рисуем в canvas и отдаём JPEG — дальше обложка
 * загружается как обычное фото встречи. shift — «Ещё варианты».
 */
type Bg = { kind: "pastel" } | { kind: "grad"; stops: [string, string, string] };
const BGS: Bg[] = [
  { kind: "pastel" },
  { kind: "grad", stops: ["#17141F", "#2A2536", "#FF6FA0"] },
  { kind: "grad", stops: ["#3A2F8F", "#17141F", "#5AA9FF"] },
  { kind: "grad", stops: ["#2A2536", "#FF6FA0", "#FFB27A"] },
  { kind: "grad", stops: ["#1A1230", "#5B3AA8", "#C871B6"] },
];

async function drawCovers(iconSrc: string, shift = 0): Promise<string[]> {
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = iconSrc;
  });
  const W = 1120;
  const H = 800;
  return [0, 1, 2].map((k) => {
    const bg = BGS[(k + shift * 3) % BGS.length]!;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");
    if (!ctx) return "";
    const blob = (x: number, y: number, r: number, col: string) => {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, col);
      rg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    };
    if (bg.kind === "pastel") {
      ctx.fillStyle = "#E9E0FF";
      ctx.fillRect(0, 0, W, H);
      blob(W * 0.18, H * 0.18, 620, "rgba(183,155,255,1)");
      blob(W * 0.9, H * 0.92, 620, "rgba(255,176,207,1)");
      blob(W * 0.9, H * 0.1, 460, "rgba(191,226,255,1)");
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, bg.stops[0]);
      g.addColorStop(0.5, bg.stops[1]);
      g.addColorStop(1, bg.stops[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      blob(W * 0.15, H * 0.2, 320, "rgba(255,255,255,.22)");
      blob(W * 0.9, H * 0.95, 380, "rgba(255,255,255,.14)");
    }
    if (img) {
      const size = H * (k === 0 ? 0.7 : 0.78);
      const rot = ((shift + k) % 2 ? 8 : -8) * (Math.PI / 180);
      ctx.save();
      ctx.translate(W * 0.5, H * 0.52);
      ctx.rotate(rot);
      ctx.shadowColor = "rgba(40,10,90,.32)";
      ctx.shadowBlur = 50;
      ctx.shadowOffsetY = 26;
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    return cv.toDataURL("image/jpeg", 0.86);
  });
}
