/**
 * Готовые фотообложки встреч (public/brand/covers/*.webp, сделаны в Nano Banana).
 * Если организатор не загрузил своё фото, Мося подставляет обложку по
 * категории. Для «Своё предложение» готовой обложки нет — там фото
 * обязательно своё (и проходит модерацию).
 */

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

const PRESET_RE = /^\/brand\/covers\/[a-z]+\.webp$/;

export function isPresetCover(value: string | null | undefined): value is string {
  return typeof value === "string" && PRESET_RE.test(value);
}

/** Полный адрес готовой обложки для записи в events.photo_url (нужен и мобильному приложению). */
export function presetCoverUrl(value: string | null | undefined): string | null {
  if (!isPresetCover(value)) return null;
  const base = (process.env.APP_URL || "https://2-xfcn.vercel.app").replace(/\/+$/, "");
  return `${base}${value}`;
}

/**
 * «Своё предложение»: Мося подбирает готовую обложку по словам, которые
 * написал организатор («пробежка», «сапы», «настолки в баре»…). Ничего
 * не подошло — null, и тогда нужно своё фото.
 */
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
  [/(^|[^а-яё])(бар|паб)|коктейл|виски|винн|(^|[^а-яё])вин[оа]|пив[оа]/i, "bar"],
  [/вечерин|туса|тусов|клуб|караоке|танц/i, "party"],
  [/поход|сап|каяк|байдар|лес|природ|рыбал|горы|лыж|сноуборд|пикник|кемп/i, "active"],
  [/прогул|гулять|погул|набережн|парк|экскурс/i, "walk"],
];

export function coverForText(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (t.length < 2) return null;
  for (const [re, slug] of TEXT_COVER) if (re.test(t)) return `/brand/covers/${slug}.webp`;
  return null;
}
