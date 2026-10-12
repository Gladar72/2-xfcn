/**
 * Готовые фотообложки встреч — копия чистых функций из веб-версии
 * (lib/photos/preset-cover.ts). Картинки лежат на сайте: /brand/covers/<slug>.webp.
 * На сервер уходит именно путь «/brand/covers/x.webp» — он сам превращает его
 * в полный адрес и не гоняет такую обложку через модерацию.
 */
import { API_URL } from "./config";

const CATEGORY_COVER: Record<string, string> = {
  coffee: "coffee",
  breakfast: "breakfast",
  dinner: "dinner",
  cinema: "cinema",
  walk: "walk",
  active: "active",
  party: "party",
};

const TRAINING_COVER: Record<string, string> = {
  gym: "gym",
  running: "running",
  yoga: "yoga",
  cycling: "cycling",
  football: "football",
  padel: "padel",
  hyrox: "hyrox",
};

/** Путь готовой обложки для категории или null (для «Своё» — всегда null). */
export function coverFor(categorySlug: string | null | undefined, trainingTypeSlug?: string | null, business?: boolean): string | null {
  if (business) return "/brand/covers/business.webp";
  if (!categorySlug || categorySlug === "custom") return null;
  if (categorySlug === "training") return `/brand/covers/${(trainingTypeSlug && TRAINING_COVER[trainingTypeSlug]) || "gym"}.webp`;
  const c = CATEGORY_COVER[categorySlug];
  return c ? `/brand/covers/${c}.webp` : null;
}

const TEXT_COVER: [RegExp, string][] = [
  [/йог|растяж|медитац|пилатес/i, "yoga"],
  [/бег|пробеж|марафон|забег/i, "running"],
  [/вело|байк|самокат/i, "cycling"],
  [/футбол|мини-футбол/i, "football"],
  [/падел|теннис|бадминтон|сквош/i, "padel"],
  [/hyrox|хайрокс|кроссфит|функционал/i, "hyrox"],
  [/трен|зал|качал|фитнес|воркаут|спорт/i, "gym"],
  [/кофе|кофейн|капучино|чай/i, "coffee"],
  [/завтрак|бранч/i, "breakfast"],
  [/ужин|обед|ресторан|кухн|пицц|суши|бургер/i, "dinner"],
  [/кино|фильм|сеанс|сериал/i, "cinema"],
  [/вечерин|туса|тусов|бар|клуб|караоке|танц|коктейл/i, "party"],
  [/поход|сап|каяк|байдар|лес|природ|рыбал|горы|лыж|сноуборд|пикник|кемп/i, "active"],
  [/прогул|гулять|погул|набережн|парк|экскурс/i, "walk"],
];

/** «Своё предложение»: обложка по словам организатора, иначе null (нужно своё фото). */
export function coverForText(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (t.length < 2) return null;
  for (const [re, slug] of TEXT_COVER) if (re.test(t)) return `/brand/covers/${slug}.webp`;
  return null;
}

/** Адрес картинки для показа: путь обложки → полный URL сайта, остальное как есть. */
export function coverUri(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.startsWith("/") ? `${API_URL}${value}` : value;
}
