/**
 * Группы и 3D-иконки интересов для анкеты (редизайн 2026).
 * Сами интересы приходят из базы (/api/interests) — здесь только то, в
 * какую группу их положить и какую иконку показать. Неизвестный интерес
 * попадает в «Ещё» с иконкой-глобусом.
 */
const I = (n: string) => `/brand/cat3d/i_${n}.webp`;

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
