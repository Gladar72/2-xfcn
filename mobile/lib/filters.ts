/** Фильтры ленты — те же параметры, что у GET /api/events и /api/events/map. */
export interface Filters {
  categories: string[];
  type: string | null;
  date: "any" | "today" | "tomorrow" | "weekend" | string;
  timeOfDay: "any" | "morning" | "day" | "evening";
  costType: "any" | "each_pays" | "organizer_treats" | "free" | "negotiable";
  gender: "any" | "male" | "female";
  ageMin: string;
  ageMax: string;
}

export const EMPTY_FILTERS: Filters = {
  categories: [],
  type: null,
  date: "any",
  timeOfDay: "any",
  costType: "any",
  gender: "any",
  ageMin: "",
  ageMax: "",
};

/** Сколько «тяжёлых» фильтров включено (для счётчика на кнопке). Категории и дата в чипах не считаются. */
export function activeCount(f: Filters): number {
  return [f.timeOfDay !== "any", f.costType !== "any", f.gender !== "any", !!f.ageMin, !!f.ageMax, !["any", "today", "tomorrow", "weekend"].includes(f.date)].filter(Boolean).length;
}

export function toQuery(f: Filters, extra: Record<string, string | undefined> = {}): string {
  // Собираем вручную: URLSearchParams в React Native реализован не полностью.
  const p: [string, string][] = [];
  if (f.categories.length) p.push(["categories", f.categories.join(",")]);
  if (f.type) p.push(["type", f.type]);
  if (f.date !== "any") p.push(["date", f.date]);
  if (f.timeOfDay !== "any") p.push(["timeOfDay", f.timeOfDay]);
  if (f.costType !== "any") p.push(["costType", f.costType]);
  if (f.gender !== "any") p.push(["gender", f.gender]);
  const min = parseInt(f.ageMin, 10);
  const max = parseInt(f.ageMax, 10);
  if (min >= 18) p.push(["ageMin", String(min)]);
  if (max >= 18) p.push(["ageMax", String(max)]);
  for (const [k, v] of Object.entries(extra)) if (v) p.push([k, v]);
  return p.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

export const DATE_OPTIONS: [Filters["date"], string][] = [
  ["any", "Любой день"],
  ["today", "Сегодня"],
  ["tomorrow", "Завтра"],
  ["weekend", "В выходные"],
];
export const TIME_OPTIONS: [Filters["timeOfDay"], string][] = [
  ["any", "Любое"],
  ["morning", "Утро"],
  ["day", "День"],
  ["evening", "Вечер"],
];
export const COST_OPTIONS: [Filters["costType"], string][] = [
  ["any", "Неважно"],
  ["each_pays", "Каждый за себя"],
  ["organizer_treats", "Автор угощает"],
  ["free", "Без расходов"],
  ["negotiable", "По договорённости"],
];
export const GENDER_OPTIONS: [Filters["gender"], string][] = [
  ["any", "Неважно"],
  ["male", "Мужчина"],
  ["female", "Женщина"],
];
