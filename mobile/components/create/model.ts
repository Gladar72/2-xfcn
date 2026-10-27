// Состояние и справочники мастера «Создать встречу» (как CreateMeetingFlow в веб-версии).

export interface Category {
  id: string;
  slug: string;
  name: string;
}
export interface TrainingType {
  id: string;
  slug: string;
  name: string;
}
export interface PlaceSuggestion {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  source?: "yandex" | "osm" | "history" | "pick";
  rating?: number | null;
  reviews?: number | null;
  note?: string | null;
}
export interface AddressSuggestion {
  address: string;
  latitude: number;
  longitude: number;
}

export type CostType = "each_pays" | "organizer_treats" | "free" | "negotiable";
export type BizPricing = "ticket" | "free" | "custom";

export interface Form {
  business: boolean;
  categorySlug: string | null;
  trainingTypeSlug: string | null;
  own: string;
  title: string;
  description: string;
  /** Своё фото: uri — для показа, data — data:URL для отправки (нет у фото, уже лежащего на сервере). */
  ownPhoto: { uri: string; data?: string } | null;
  useOwnPhoto: boolean;
  dayIso: string;
  /** Начало — минуты от полуночи. */
  startMin: number;
  duration: number;
  durOwn: boolean;
  placeName: string;
  address: string;
  latitude?: number;
  longitude?: number;
  seatsTotal: number;
  costType: CostType;
  bizPricing: BizPricing;
  ticketPrice: string;
  bizTerms: string;
  isAnonymous: boolean;
}

export type SetForm = (patch: Partial<Form>) => void;

export const COSTS: [CostType, string][] = [
  ["each_pays", "Каждый за себя"],
  ["organizer_treats", "Автор угощает"],
  ["free", "Без расходов"],
  ["negotiable", "По договорённости"],
];
export const BIZ_PRICING: [BizPricing, string][] = [
  ["ticket", "Билет"],
  ["free", "Бесплатно"],
  ["custom", "Другие условия"],
];
export const DURS: [number, string][] = [
  [60, "1 ч"],
  [90, "1,5 ч"],
  [120, "2 ч"],
  [180, "3 ч"],
  [240, "4 ч"],
];

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
};

const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const WDL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MG = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export function isoOf(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseIso(iso: string) {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dayDiff(iso: string) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((parseIso(iso).getTime() - t.getTime()) / 864e5);
}

/** Ближайшие n дней (ISO). */
export function nextDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return isoOf(d);
  });
}

/** Подпись чипа: «Сегодня», «Завтра», «Пт, 17». */
export function dayChip(iso: string) {
  const i = dayDiff(iso);
  const d = parseIso(iso);
  return i === 0 ? "Сегодня" : i === 1 ? "Завтра" : `${WD[d.getDay()]}, ${d.getDate()}`;
}

/** Длинная подпись: «Сегодня, 12 октября» / «Пятница, 17 октября». */
export function dayLong(iso: string) {
  const i = dayDiff(iso);
  const d = parseIso(iso);
  const tail = `${d.getDate()} ${MG[d.getMonth()]}`;
  if (i === 0) return `Сегодня, ${tail}`;
  if (i === 1) return `Завтра, ${tail}`;
  const wd = WDL[d.getDay()] ?? "";
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${tail}`;
}

/** Время уже прошло (по часам телефона). Сервер проверяет ещё раз по часовому поясу города. */
export function isPast(iso: string, startMin: number) {
  const d = parseIso(iso);
  d.setMinutes(startMin);
  return d.getTime() <= Date.now();
}

export function initialForm(business: boolean, categorySlug: string | null, trainingTypeSlug: string | null): Form {
  const now = new Date();
  return {
    business,
    categorySlug,
    trainingTypeSlug,
    own: "",
    title: "",
    description: "",
    ownPhoto: null,
    useOwnPhoto: false,
    dayIso: isoOf(now),
    startMin: Math.min(23, now.getHours() + 1) * 60,
    duration: 120,
    durOwn: false,
    placeName: "",
    address: "",
    seatsTotal: 3,
    costType: "each_pays",
    bizPricing: "ticket",
    ticketPrice: "",
    bizTerms: "",
    isAnonymous: false,
  };
}

/** Встреча с сервера (GET /api/events/:id) → состояние мастера, как в веб-версии. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formFromEvent(e: any): { form: Form; minSeats: number } {
  const [h = 19, m = 0] = String(e.eventTime ?? "19:00").split(":").map(Number);
  const start = h * 60 + m;
  let duration = 120;
  let durOwn = false;
  if (e.eventEndTime) {
    const [eh = 0, em = 0] = String(e.eventEndTime).split(":").map(Number);
    duration = (eh * 60 + em - start + 1440) % 1440 || 120;
    durOwn = !DURS.some(([v]) => v === duration);
  }
  const bp = (e.businessPricingType ?? "ticket") as BizPricing;
  const form: Form = {
    ...initialForm(!!e.isBusiness, e.category?.slug ?? null, e.trainingType?.slug ?? null),
    title: e.title ?? "",
    // Бизнес-события и «Своё» — категория custom: без этого правка застревала на первом шаге.
    own: e.category?.slug === "custom" ? String(e.title ?? "").slice(0, 30) : "",
    description: e.description ?? "",
    ownPhoto: e.photoUrl ? { uri: e.photoUrl } : null,
    useOwnPhoto: !!e.photoUrl,
    dayIso: typeof e.eventDate === "string" ? e.eventDate.slice(0, 10) : isoOf(new Date()),
    startMin: start,
    duration,
    durOwn,
    placeName: e.placeName ?? "",
    address: e.address ?? "",
    latitude: typeof e.latitude === "number" ? e.latitude : undefined,
    longitude: typeof e.longitude === "number" ? e.longitude : undefined,
    seatsTotal: e.seatsTotal ?? 3,
    costType: (e.costType ?? "each_pays") as CostType,
    isAnonymous: !!e.isAnonymous,
    bizPricing: bp,
    ticketPrice: bp === "ticket" ? String(e.businessPricingDetails ?? "").replace(/[^\d]/g, "") : "",
    bizTerms: bp === "custom" ? e.businessPricingDetails ?? "" : "",
  };
  return { form, minSeats: Math.max(1, e.seatsTaken ?? 1) };
}
