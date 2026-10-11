import { interestIcon } from "@/lib/data/interests";

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
  if (!ideas.length) return null;
  const low = (l: string[]) => l.map((x) => x.toLowerCase()).join(", ");
  const rest = interests.filter((i) => !common.includes(i)).slice(0, 3);
  const offer = ideas.length > 1 ? `${ideas[0].what} или ${ideas[1].what}` : ideas[0].what;
  const about = common.length
    ? `у вас общее: ${low(common.slice(0, 3))}${rest.length ? `, а ещё любит ${low(rest)}` : ""}`
    : `в интересах: ${low(rest)}`;
  return { text: `Я изучил профиль — ${about}. Позови ${offer}, встречу создам за минуту 😉`, ideas };
}
