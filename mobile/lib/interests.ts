/**
 * Копия lib/data/interests.ts и lib/mosya/suggest.ts из веб-версии.
 * Группы и 3D-иконки интересов для анкеты (редизайн 2026).
 * Сами интересы приходят из базы (/api/interests) — здесь только то, в
 * какую группу их положить и какую иконку показать. Неизвестный интерес
 * попадает в «Ещё» с иконкой-глобусом.
 */
import { API_URL } from "./config";

const I = (n: string) => `${API_URL}/brand/cat3d/i_${n}.webp`;

export const INTEREST_GROUPS: { title: string; items: [name: string, icon: string][] }[] = [
  {
    title: "Активный отдых",
    items: [
      ["Бег", I("run")], ["Спортзал", I("gym")], ["Йога", I("yoga")], ["Велосипед", I("bike")],
      ["Походы", I("hike")], ["Кемпинг", I("camp")], ["Лыжи и сноуборд", I("ski")], ["Бассейн", I("swim")],
      ["Футбол", I("football")], ["Теннис", I("tennis")], ["Единоборства", I("box")], ["Ролики", I("roller")],
      ["Танцы", I("party")], ["Природа", I("hike")],
    ],
  },
  {
    title: "Культура и путешествия",
    items: [
      ["Путешествия", I("travel")], ["Поездки на выходные", I("trip")], ["Экскурсии", I("world")], ["Фотография", I("photo")],
      ["Кино", I("kino")], ["Театр", I("theatre")], ["Музыка", I("music")], ["Караоке", I("karaoke")],
      ["Джем-сейшны", I("guitar")], ["Выставки", I("art")], ["Искусство", I("art")], ["Книжный клуб", I("books")],
      ["Книги", I("books")], ["Концерты", I("concert")],
    ],
  },
  {
    title: "Еда и общение",
    items: [
      ["Кофе", I("kofe")], ["Завтраки", I("zavtrak")], ["Ужины", I("uzhin")], ["Бары", I("bar")],
      ["Стритфуд", I("pizza")], ["Вечеринки", I("party")], ["Настолки", I("games")], ["Настольные игры", I("games")],
      ["Кулинария", I("cook")], ["Готовка", I("cook")], ["Прогулки с собакой", I("dogs")], ["Нетворкинг", I("biz")],
      ["Технологии", I("biz")], ["Баня", I("banya")], ["Языковой обмен", I("lang")],
    ],
  },
];

const ICON = new Map(INTEREST_GROUPS.flatMap((g) => g.items));

export function interestIcon(name: string): string {
  return ICON.get(name) ?? I("world");
}

/** Раскладывает интересы из базы по группам (в порядке групп), остальное — в «Ещё». */
export function groupInterests<T extends { name: string }>(list: T[]): { title: string; items: T[] }[] {
  const byName = new Map(list.map((x) => [x.name, x]));
  const used = new Set<string>();
  const groups = INTEREST_GROUPS.map((g) => ({
    title: g.title,
    items: g.items
      .map(([n]) => byName.get(n))
      .filter((x): x is T => {
        if (!x || used.has(x.name)) return false;
        used.add(x.name);
        return true;
      }),
  }));
  const rest = list.filter((x) => !used.has(x.name));
  if (rest.length) groups.push({ title: "Ещё", items: rest });
  return groups.filter((g) => g.items.length > 0);
}

// ——— «Мося советует»: на какую встречу позвать человека (lib/mosya/suggest.ts) ———
/**
 * «Мося изучил профиль»: по интересам человека подбираем, на какую
 * встречу его лучше позвать. Сначала — общие интересы, потом его личные.
 */
interface Idea {
  /** Что предлагаем: «в кино», «на пробежку». */
  what: string;
  /** Подпись на карточке-кнопке. */
  title: string;
  category: string;
  type?: string;
}

const MAP: Record<string, Idea> = {
  Кино: { what: "в кино", title: "Сходить в кино", category: "cinema" },
  Театр: { what: "в театр", title: "Сходить в театр", category: "custom" },
  Кофе: { what: "на кофе", title: "Попить кофе", category: "coffee" },
  Завтраки: { what: "на завтрак", title: "Совместный завтрак", category: "breakfast" },
  Ужины: { what: "на ужин", title: "Поужинать вместе", category: "dinner" },
  Бары: { what: "в бар", title: "Вечер в баре", category: "dinner" },
  Стритфуд: { what: "на стритфуд", title: "Стритфуд-прогулка", category: "walk" },
  Кулинария: { what: "на ужин", title: "Поужинать вместе", category: "dinner" },
  Готовка: { what: "на ужин", title: "Поужинать вместе", category: "dinner" },
  Вечеринки: { what: "на вечеринку", title: "Вечеринка", category: "party" },
  Танцы: { what: "на танцы", title: "Вечер танцев", category: "party" },
  Караоке: { what: "в караоке", title: "Караоке", category: "party" },
  Концерты: { what: "на концерт", title: "Сходить на концерт", category: "party" },
  Музыка: { what: "на концерт", title: "Сходить на концерт", category: "party" },
  Бег: { what: "на пробежку", title: "Пробежка вместе", category: "training", type: "running" },
  Спортзал: { what: "в зал", title: "Тренировка в зале", category: "training", type: "gym" },
  Йога: { what: "на йогу", title: "Йога вместе", category: "training", type: "yoga" },
  Велосипед: { what: "на велопрогулку", title: "Велопрогулка", category: "training", type: "cycling" },
  Футбол: { what: "на футбол", title: "Сыграть в футбол", category: "training", type: "football" },
  Теннис: { what: "на теннис", title: "Сыграть в теннис/падел", category: "training", type: "padel" },
  Походы: { what: "в поход", title: "Поход на природу", category: "active" },
  Природа: { what: "на природу", title: "Выезд на природу", category: "active" },
  Кемпинг: { what: "в кемпинг", title: "Кемпинг", category: "active" },
  "Лыжи и сноуборд": { what: "на склон", title: "Лыжи или сноуборд", category: "active" },
  Ролики: { what: "на роликах", title: "Покататься на роликах", category: "active" },
  "Поездки на выходные": { what: "в поездку", title: "Поездка на выходные", category: "active" },
  Путешествия: { what: "в поездку", title: "Поездка на выходные", category: "active" },
  Экскурсии: { what: "на экскурсию", title: "Экскурсия по городу", category: "walk" },
  Фотография: { what: "на фотопрогулку", title: "Фотопрогулка", category: "walk" },
  "Прогулки с собакой": { what: "на прогулку с собакой", title: "Прогулка с собаками", category: "walk" },
  Выставки: { what: "на выставку", title: "Сходить на выставку", category: "custom" },
  Искусство: { what: "на выставку", title: "Сходить на выставку", category: "custom" },
  Настолки: { what: "на настолки", title: "Вечер настолок", category: "custom" },
  "Настольные игры": { what: "на настолки", title: "Вечер настолок", category: "custom" },
  "Книжный клуб": { what: "в книжный клуб", title: "Книжный клуб", category: "coffee" },
  Книги: { what: "на кофе с книгами", title: "Кофе и книги", category: "coffee" },
  "Языковой обмен": { what: "на языковой обмен", title: "Языковой обмен", category: "coffee" },
  Нетворкинг: { what: "на нетворкинг", title: "Кофе-нетворкинг", category: "coffee" },
  Баня: { what: "в баню", title: "Баня с друзьями", category: "custom" },
};

export interface Suggestion {
  /** Текст Моси. */
  text: string;
  ideas: (Idea & { icon: string; interest: string; common: boolean })[];
}

export function suggestMeet(interests: string[], common: string[]): Suggestion | null {
  const order = [...common, ...interests.filter((i) => !common.includes(i))];
  const seen = new Set<string>();
  const ideas: Suggestion["ideas"] = [];
  for (const i of order) {
    const idea = MAP[i];
    if (!idea || seen.has(idea.title)) continue;
    seen.add(idea.title);
    ideas.push({ ...idea, icon: interestIcon(i), interest: i, common: common.includes(i) });
    if (ideas.length === 2) break;
  }
  const [first, second] = ideas;
  if (!first) return null;
  const low = (l: string[]) => l.map((x) => x.toLowerCase()).join(", ");
  const rest = interests.filter((i) => !common.includes(i)).slice(0, 3);
  const offer = second ? `${first.what} или ${second.what}` : first.what;
  const about = common.length
    ? `у вас общее: ${low(common.slice(0, 3))}${rest.length ? `, а ещё любит ${low(rest)}` : ""}`
    : `в интересах: ${low(rest)}`;
  return { text: `Я изучил профиль — ${about}. Позови ${offer}, встречу создам за минуту 😉`, ideas };
}

/** Коротко для карточек: «рядом», «700 м», «1,4 км», «12 км» (lib/geo/approx-distance.ts). */
export function distanceShort(m: number | null | undefined): string | null {
  if (m == null) return null;
  if (m <= 0) return "рядом";
  if (m < 1000) return `${m} м`;
  if (m < 10_000) return `${(m / 1000).toFixed(1).replace(".", ",").replace(",0", "")} км`;
  return `${Math.round(m / 1000)} км`;
}

/** «меньше 1 км от тебя» / «≈ N км от тебя» (lib/geo/approx-distance.ts). */
export function distanceLabel(km: number | null | undefined): string | null {
  if (km == null) return null;
  return km === 0 ? "меньше 1 км от тебя" : `≈ ${km} км от тебя`;
}
