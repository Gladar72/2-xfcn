import { API_URL } from "./config";

/**
 * Копия lib/events/biz-categories.ts сайта (держать одинаковыми).
 *
 * Категории «Для бизнеса» — фильтр карты заведений и списка событий.
 *
 * Отдельного поля «тип заведения» у событий нет, поэтому категорию
 * определяем по тому, что есть: категория встречи (slug), тип события
 * города (kind: concert, theatre…) и слова в названии. Одно событие может
 * попасть в несколько категорий (например, «Джаз-концерт в баре»).
 */
export interface BizCategory {
  key: string;
  label: string;
  icon: string;
  slugs?: string[];
  kinds?: string[];
  words?: RegExp;
}

export const BIZ_CATEGORIES: BizCategory[] = [
  {
    key: "food",
    label: "Кафе и рестораны",
    icon: "i_uzhin",
    slugs: ["coffee", "breakfast", "dinner"],
    words: /кофе|завтрак|бранч|ужин|обед|дегустац|ресторан|кафе|гастро|винн|пицц|суши|кухн/i,
  },
  {
    key: "bars",
    label: "Бары и вечеринки",
    icon: "i_bar",
    slugs: ["party"],
    kinds: ["party", "karaoke"],
    words: /(^|[^а-яё])бар(?!бер|абан|хат)|коктейл|вечеринк|\bdj\b|диджей|караоке|(^|[^а-яё])пати|party|(^|[^а-яё])паб([^а-яё]|$)|лаунж|кальян/i,
  },
  {
    key: "concerts",
    label: "Концерты",
    icon: "i_concert",
    kinds: ["concert", "festival"],
    words: /концерт|\blive\b|лайв|джаз|(^|[^а-яё])рок([^а-яё]|$)|акустик|фестивал|музыкант|кавер|оркестр/i,
  },
  {
    key: "theatre",
    label: "Театр и стендап",
    icon: "i_theatre",
    kinds: ["theatre", "ballet", "standup"],
    words: /спектакл|театр|стендап|stand.?up|балет|импров|комеди|(^|[^а-яё])опер[аеуы]([^а-яё]|$)/i,
  },
  {
    key: "workshops",
    label: "Мастер-классы",
    icon: "i_cook",
    kinds: ["workshop"],
    words: /мастер.?класс|(^|[^а-яё])мк([^а-яё]|$)|воркшоп|workshop|лекци|(^|[^а-яё])курс|тренинг|(^|[^а-яё])урок/i,
  },
  {
    key: "art",
    label: "Выставки и экскурсии",
    icon: "i_art",
    kinds: ["exhibition", "excursion", "fashion"],
    words: /выставк|экскурси|музей|галере|(^|[^а-яё])арт([^а-яё]|-|$)|маркет|ярмарк/i,
  },
  {
    key: "games",
    label: "Квизы и игры",
    icon: "i_games",
    kinds: ["quiz"],
    words: /квиз|quiz|настолк|игр[аы]|мафи|турнир/i,
  },
  {
    key: "cinema",
    label: "Кино",
    icon: "i_kino",
    slugs: ["cinema"],
    words: /(^|[^а-яё])кино|фильм/i,
  },
  {
    key: "sport",
    label: "Спорт",
    icon: "i_run",
    slugs: ["active", "running", "training", "yoga", "gym", "football", "padel", "hyrox", "cycling"],
    kinds: ["sport"],
    words: /забег|(^|[^а-яё])йог|тренировк|спорт|фитнес|растяжк|(^|[^а-яё])бег([^а-яё]|$)/i,
  },
  {
    key: "kids",
    label: "Детям",
    icon: "i_games",
    kinds: ["kids"],
    words: /дет(и|ск)|семейн|малыш/i,
  },
];

/** «Другое» — событие не подошло ни под одну категорию. */
export const BIZ_OTHER: BizCategory = { key: "other", label: "Другое", icon: "i_biz" };

export function bizCategoryIcon(c: BizCategory) {
  return `${API_URL}/brand/cat3d/${c.icon}.webp`;
}

export interface BizCategorizable {
  title?: string | null;
  category?: { slug?: string | null } | null;
  kind?: string | null;
}

/** Ключи категорий, в которые попадает событие (хотя бы одна — иначе «other»). */
export function bizCategoriesOf(e: BizCategorizable): string[] {
  const slug = e.category?.slug ?? "";
  const kind = e.kind ?? "";
  const title = e.title ?? "";
  const keys = BIZ_CATEGORIES.filter(
    (c) => (slug && c.slugs?.includes(slug)) || (kind && c.kinds?.includes(kind)) || (title && c.words?.test(title))
  ).map((c) => c.key);
  return keys.length ? keys : [BIZ_OTHER.key];
}

/** Категории, в которых есть хотя бы одно событие, со счётчиками — для фильтра. */
export function bizCategoryCounts(items: BizCategorizable[]): { cat: BizCategory; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of items) for (const k of bizCategoriesOf(e)) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...BIZ_CATEGORIES, BIZ_OTHER]
    .map((cat) => ({ cat, count: counts.get(cat.key) ?? 0 }))
    .filter((x) => x.count > 0);
}

export function matchesBizCategory(e: BizCategorizable, key: string | null | undefined) {
  return !key || bizCategoriesOf(e).includes(key);
}
