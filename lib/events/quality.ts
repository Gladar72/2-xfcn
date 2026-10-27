/**
 * Проверка «встреча не от балды»: понятное название, место и пара слов о цели.
 * Общая для сервера (POST /api/events) и мастера создания — Мося подсказывает,
 * что дописать, а сервер не пропускает пустые встречи вроде «пока не придумал».
 * Копия для мобильного приложения — mobile/lib/eventQuality.ts (держать одинаковыми).
 */

const JUNK = [
  "пока не придумал", "пока не придумала", "не придумал", "не придумала", "потом придумаю", "потом напишу",
  "не знаю", "незнаю", "хз", "тест", "test", "проверка", "что нибудь", "что-нибудь", "что то", "что-то",
  "встреча", "название", "без названия", "описание", "просто", "так", "да", "нет", "ок", "asdf", "qwerty", "йцук",
];
const JUNK_PARTS = ["не придумал", "потом придумаю", "потом напишу", "не знаю что", "незнаю что", "хз что", "лень писать"];

function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function isJunk(s: string): boolean {
  const n = norm(s);
  if (!n) return true;
  if (JUNK.includes(n)) return true;
  if (JUNK_PARTS.some((p) => n.includes(p))) return true;
  if (/^(.)\1+$/.test(n.replace(/\s/g, ""))) return true; // «ааааа», «......»
  if (!/[a-zа-я]{2}/.test(n)) return true; // только цифры/значки
  return false;
}

const words = (s: string) => norm(s).split(" ").filter((w) => /[a-zа-я]/.test(w));

// Признаки бизнес-события: такие создают в разделе «Для бизнеса», а не как встречу людей.
const BUSINESS_RE =
  /мастер[\s-]?класс|мастеркласс|воркшоп|workshop|семинар|вебинар|тренинг|обучени|провожу|проведу|научу|стоимость участия|предоплат|платн(ый|ое|ая) (вход|участи|занят|мероприят)|записывайтесь|запись по телефону|бронь по телефону/;

export const QUALITY_TEXT = {
  title: "Название не подходит 🙂 Напиши, что будете делать — например «Кофе и настолки в субботу».",
  description: "Расскажи в паре предложений, что будете делать и для кого — так к тебе захотят прийти.",
  place: "Выбери место встречи — без него никто не придёт.",
  business:
    "Похоже, ты проводишь событие — мастер-класс, семинар или платное занятие. Такие создают в разделе «Для бизнеса»: там можно указать цену и позвать до 500 гостей. Обычная встреча — когда просто ищешь компанию.",
};

/** Обычную встречу создают люди для людей; мастер-классы, лекции, платные события — только через «Для бизнеса». */
export function businessProblem(title: string, description: string): string | null {
  const t = `${title} ${description}`.toLowerCase().replace(/ё/g, "е");
  return BUSINESS_RE.test(t) ? QUALITY_TEXT.business : null;
}

export function titleProblem(title: string): string | null {
  const t = title.trim();
  if (t.length < 3 || isJunk(t)) return QUALITY_TEXT.title;
  return null;
}

export function descriptionProblem(description: string): string | null {
  const d = description.trim();
  if (d.length < 20 || words(d).length < 3 || isJunk(d)) return QUALITY_TEXT.description;
  return null;
}

/** Первая проблема встречи и поле, к которому она относится (или null — всё хорошо). */
export function eventQualityProblem(e: {
  title: string;
  description: string;
  placeName?: string | null;
  hasPoint?: boolean;
  isBusiness?: boolean;
}): { field: "title" | "description" | "placeName" | "isBusiness"; message: string } | null {
  const t = titleProblem(e.title);
  if (t) return { field: "title", message: t };
  if (!e.isBusiness) {
    const b = businessProblem(e.title, e.description);
    if (b) return { field: "isBusiness", message: b };
  }
  const d = descriptionProblem(e.description);
  if (d) return { field: "description", message: d };
  if ((e.placeName ?? "").trim().length < 2 && !e.hasPoint) return { field: "placeName", message: QUALITY_TEXT.place };
  return null;
}
