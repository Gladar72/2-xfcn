mkdir -p "lib/data"
cat > "lib/data/city-timezones.ts" << 'ENDOFFILE'
/**
 * Смещение UTC (в часах) для каждого города из RUSSIAN_CITIES —
 * используется, чтобы отправлять утренние напоминания (см.
 * lib/morning-reminders/) по РЕАЛЬНОМУ местному времени пользователя,
 * а не по времени сервера.
 *
 * Официальные часовые пояса РФ (действуют круглый год, без перевода
 * стрелок с 2014 года). Составлено по знанию административного деления
 * регионов — при значительном изменении списка городов (lib/data/russian-cities.ts)
 * стоит перепроверить новые записи.
 */
export const CITY_UTC_OFFSET: Record<string, number> = {
  // UTC+2 — Калининград
  "Калининград": 2,

  // UTC+4 — Самарская область, Удмуртия
  "Самара": 4, "Тольятти": 4, "Сызрань": 4, "Новокуйбышевск": 4, "Жигулёвск": 4,
  "Ижевск": 4, "Сарапул": 4,
  "Ульяновск": 4, "Димитровград": 4,

  // UTC+5 — Урал, Башкортостан, ХМАО, ЯНАО
  "Екатеринбург": 5, "Нижний Тагил": 5, "Каменск-Уральский": 5, "Первоуральск": 5,
  "Асбест": 5, "Верхняя Пышма": 5, "Краснотурьинск": 5, "Полевской": 5, "Ревда": 5,
  "Серов": 5, "Сухой Лог": 5,
  "Пермь": 5, "Березники": 5, "Лысьва": 5, "Соликамск": 5,
  "Челябинск": 5, "Магнитогорск": 5, "Златоуст": 5, "Копейск": 5, "Миасс": 5,
  "Уфа": 5, "Стерлитамак": 5, "Салават": 5, "Нефтекамск": 5, "Октябрьский": 5,
  "Белебей": 5, "Белорецк": 5, "Кумертау": 5, "Мелеуз": 5, "Туймазы": 5,
  "Оренбург": 5, "Орск": 5, "Бузулук": 5,
  "Курган": 5, "Шадринск": 5,
  "Тюмень": 5, "Тобольск": 5,
  "Ханты-Мансийск": 5, "Сургут": 5, "Нижневартовск": 5, "Нефтеюганск": 5,
  "Когалым": 5, "Урай": 5, "Излучинск": 5,
  "Новый Уренгой": 5, "Ноябрьск": 5, "Муравленко": 5, "Ямбург": 5,

  // UTC+6 — Омская область
  "Омск": 6,

  // UTC+7 — Западная Сибирь, Красноярский край, Алтай, Тыва
  "Новосибирск": 7, "Бердск": 7,
  "Красноярск": 7, "Норильск": 7, "Ачинск": 7, "Канск": 7, "Назарово": 7, "Зеленогорск": 7,
  "Кемерово": 7, "Новокузнецк": 7, "Прокопьевск": 7, "Белово": 7,
  "Томск": 7, "Северск": 7,
  "Барнаул": 7, "Бийск": 7, "Рубцовск": 7, "Новоалтайск": 7, "Заринск": 7,
  "Горно-Алтайск": 7, "Абакан": 7, "Кызыл": 7,

  // UTC+8 — Иркутская область, Бурятия
  "Иркутск": 8, "Ангарск": 8, "Братск": 8, "Усть-Илимск": 8,
  "Улан-Удэ": 8,

  // UTC+9 — Забайкальский край, Якутия, Амурская область
  "Чита": 9, "Краснокаменск": 9,
  "Якутск": 9,
  "Благовещенск": 9,

  // UTC+10 — Приморский и Хабаровский край
  "Владивосток": 10, "Находка": 10, "Уссурийск": 10, "Артём": 10, "Арсеньев": 10,
  "Хабаровск": 10, "Комсомольск-на-Амуре": 10,

  // UTC+11 — Сахалин, Магадан
  "Южно-Сахалинск": 11, "Магадан": 11,

  // UTC+12 — Камчатка
  "Петропавловск-Камчатский": 12,
};

/** Города без явной записи в CITY_UTC_OFFSET считаются московским временем (UTC+3) — им соответствует подавляющее большинство списка. */
export const DEFAULT_CITY_UTC_OFFSET = 3;

export function getCityUtcOffset(city: string | null | undefined): number {
  if (!city) return DEFAULT_CITY_UTC_OFFSET;
  return CITY_UTC_OFFSET[city] ?? DEFAULT_CITY_UTC_OFFSET;
}
ENDOFFILE

mkdir -p "lib/morning-reminders"
cat > "lib/morning-reminders/message-bank.ts" << 'ENDOFFILE'
/**
 * Готовый банк утренних напоминаний — используется как база без
 * обязательного подключения платной нейросети (см. ТЗ). Если в проекте
 * появится генерация через AI — её можно подключить в pick-message.ts с
 * теми же проверками истории, а этот банк останется резервным вариантом
 * на случай сбоя.
 *
 * greetingKey — не текст приветствия, а его КЛАСС (для правила "не то же
 * самое приветствие в последних 5 сообщениях" — см. pick-message.ts).
 * Сообщения с одинаковым greetingKey специально формулируют начало
 * похоже, но не идентично.
 */

export type ReminderTopic = "training" | "cinema" | "coffee" | "breakfast" | "dinner" | "walk" | "custom";

export interface ReminderMessage {
  id: string;
  topic: ReminderTopic;
  greetingKey: string;
  text: string;
}

export const MORNING_REMINDER_MESSAGES: ReminderMessage[] = [
  // --- Тренировка ---
  { id: "training-1", topic: "training", greetingKey: "dobroe_utro", text: "Доброе утро! Тело просит размяться? Найди компанию на тренировку в МЕСТЕ — вдвоём мотивация как-то сильнее. Или предложи своё время и место." },
  { id: "training-2", topic: "training", greetingKey: "kak_tebe", text: "Как тебе идея начать день с движения? В МЕСТЕ уже могут искать напарника на тренировку. Загляни — или сам предложи, во сколько удобно." },
  { id: "training-3", topic: "training", greetingKey: "nu_chto", text: "Ну что, разомнёмся сегодня? 🏋️ Совместная тренировка идёт бодрее, чем в одиночку. Посмотри, что предлагают в МЕСТЕ." },
  { id: "training-4", topic: "training", greetingKey: "privet", text: "Привет! Кроссовки заждались. Если хочется потренироваться не одному — загляни в МЕСТО, там можно найти партнёра или предложить своё время." },
  { id: "training-5", topic: "training", greetingKey: "utro_slovo", text: "Утро — неплохой момент для спорта. Составь компанию кому-то в МЕСТЕ на тренировку, или предложи собственный формат." },
  { id: "training-6", topic: "training", greetingKey: "slushai", text: "Слушай, а если сегодня потренироваться вдвоём? В МЕСТЕ можно найти того, кто тоже не прочь размяться, или предложить свою идею." },
  { id: "training-7", topic: "training", greetingKey: "gotov", text: "Готов к небольшой встряске с утра? 💪 В МЕСТЕ иногда ищут напарника на зал или пробежку — можно присоединиться или предложить своё." },
  { id: "training-8", topic: "training", greetingKey: "segodnya", text: "Сегодня отличный день, чтобы не тренироваться в одиночку. Проверь МЕСТО — вдруг рядом ищут компанию, или сам позови кого-то." },
  { id: "training-9", topic: "training", greetingKey: "a_chto_esli", text: "А что если вечером — тренировка вместе? Загляни в МЕСТО, посмотри варианты на сегодня или предложи своё время." },

  // --- Кино ---
  { id: "cinema-1", topic: "cinema", greetingKey: "dobroe_utro", text: "Доброе утро! Есть идея на вечер: большой экран и компания для обсуждения фильма 🍿 Посмотри, кто собирается в кино в МЕСТЕ." },
  { id: "cinema-2", topic: "cinema", greetingKey: "kak_tebe", text: "Как насчёт кино вечером? В МЕСТЕ можно найти, с кем сходить, или предложить свой сеанс и время." },
  { id: "cinema-3", topic: "cinema", greetingKey: "nu_chto", text: "Ну что, в кино сегодня? Одному смотреть можно, а обсудить потом веселее вдвоём. Загляни в МЕСТО." },
  { id: "cinema-4", topic: "cinema", greetingKey: "privet", text: "Привет! Если вечер свободен — можно закрыть его хорошим фильмом. В МЕСТЕ иногда ищут компанию на сеанс." },
  { id: "cinema-5", topic: "cinema", greetingKey: "utro_slovo", text: "Утро — время строить планы на вечер. Кино и компания для разговора после — неплохой вариант, посмотри в МЕСТЕ." },
  { id: "cinema-6", topic: "cinema", greetingKey: "slushai", text: "Слушай, а вечером можно и в кино. В МЕСТЕ бывает, что кто-то ищет компанию на сеанс — или сам предложи фильм." },
  { id: "cinema-7", topic: "cinema", greetingKey: "gotov", text: "Готов к вечернему фильму? 🎬 В МЕСТЕ можно найти того, кто тоже хочет в кино, или предложить своё время сеанса." },
  { id: "cinema-8", topic: "cinema", greetingKey: "segodnya", text: "Сегодня можно закончить день в кино. Проверь МЕСТО — вдруг найдётся компания на вечерний сеанс." },
  { id: "cinema-9", topic: "cinema", greetingKey: "a_chto_esli", text: "А что если сегодня вечером — кино? Посмотри в МЕСТЕ, кто ищет компанию, или предложи свой сеанс." },

  // --- Кофе ---
  { id: "coffee-1", topic: "coffee", greetingKey: "dobroe_utro", text: "Доброе утро, соня! ☀️ Кофе уже в планах? Можно добавить к нему приятную компанию — загляни в МЕСТО." },
  { id: "coffee-2", topic: "coffee", greetingKey: "kak_tebe", text: "Как насчёт кофе с разговором сегодня? В МЕСТЕ можно найти, с кем встретиться, или предложить своё время и место." },
  { id: "coffee-3", topic: "coffee", greetingKey: "nu_chto", text: "Ну что, чашка кофе и компания? В МЕСТЕ иногда ищут собеседника на утренний или дневной кофе." },
  { id: "coffee-4", topic: "coffee", greetingKey: "privet", text: "Привет! Если планируешь кофе — можно не пить его в одиночку. Посмотри в МЕСТЕ, кто рядом ищет компанию." },
  { id: "coffee-5", topic: "coffee", greetingKey: "utro_slovo", text: "Утро располагает к неспешному кофе и разговору. В МЕСТЕ можно найти компанию — или предложить своё место." },
  { id: "coffee-6", topic: "coffee", greetingKey: "slushai", text: "Слушай, а если сегодня кофе не одному? В МЕСТЕ можно предложить встречу или откликнуться на чью-то." },
  { id: "coffee-7", topic: "coffee", greetingKey: "gotov", text: "Готов к чашке кофе и компании? ☕ Проверь МЕСТО — вдруг кто-то рядом тоже не против поболтать." },
  { id: "coffee-8", topic: "coffee", greetingKey: "segodnya", text: "Сегодня можно устроить кофе-паузу с кем-то новым. Загляни в МЕСТО и посмотри, что предлагают." },
  { id: "coffee-9", topic: "coffee", greetingKey: "a_chto_esli", text: "А что если кофе сегодня — не в одиночку? В МЕСТЕ можно найти компанию на чашку и разговор." },

  // --- Завтрак ---
  { id: "breakfast-1", topic: "breakfast", greetingKey: "dobroe_utro", text: "Доброе утро! Завтрак вкуснее в компании. Посмотри в МЕСТЕ, кто сегодня ищет собеседника за утренним столом." },
  { id: "breakfast-2", topic: "breakfast", greetingKey: "kak_tebe", text: "Как тебе идея позавтракать не одному сегодня? В МЕСТЕ можно найти компанию или предложить своё место." },
  { id: "breakfast-3", topic: "breakfast", greetingKey: "nu_chto", text: "Ну что, завтрак вдвоём? В МЕСТЕ иногда предлагают встречи за утренним столом — загляни, вдруг найдётся вариант." },
  { id: "breakfast-4", topic: "breakfast", greetingKey: "privet", text: "Привет! Если ещё не завтракал — можно найти компанию в МЕСТЕ. Или предложи своё время и кафе." },
  { id: "breakfast-5", topic: "breakfast", greetingKey: "utro_slovo", text: "Утро само просит хорошего завтрака и разговора. В МЕСТЕ можно найти того, кто тоже не против компании." },
  { id: "breakfast-6", topic: "breakfast", greetingKey: "slushai", text: "Слушай, а если сегодня завтрак с кем-то? В МЕСТЕ можно откликнуться на чужую встречу или предложить свою." },
  { id: "breakfast-7", topic: "breakfast", greetingKey: "gotov", text: "Готов к завтраку в компании? 🥐 Проверь МЕСТО — там иногда ищут собеседника на утро." },
  { id: "breakfast-8", topic: "breakfast", greetingKey: "segodnya", text: "Сегодня можно позавтракать не в одиночестве. Загляни в МЕСТО и посмотри, кто предлагает встречу." },
  { id: "breakfast-9", topic: "breakfast", greetingKey: "a_chto_esli", text: "А что если сегодня завтрак — с компанией? В МЕСТЕ можно найти вариант или предложить свой." },

  // --- Ужин ---
  { id: "dinner-1", topic: "dinner", greetingKey: "dobroe_utro", text: "Доброе утро! Уже есть идея на ужин? Можно провести его не одному — посмотри в МЕСТЕ, кто ищет компанию." },
  { id: "dinner-2", topic: "dinner", greetingKey: "kak_tebe", text: "Как насчёт ужина с разговорами сегодня вечером? В МЕСТЕ можно найти компанию или предложить своё место." },
  { id: "dinner-3", topic: "dinner", greetingKey: "nu_chto", text: "Ну что, ужин без спешки и в компании? Загляни в МЕСТО — вдруг найдётся подходящий вариант на вечер." },
  { id: "dinner-4", topic: "dinner", greetingKey: "privet", text: "Привет! Вечер — время для ужина и разговора. В МЕСТЕ иногда ищут компанию на такие встречи." },
  { id: "dinner-5", topic: "dinner", greetingKey: "utro_slovo", text: "Утро — подходящее время придумать план на вечер: ужин и компания для беседы. Посмотри в МЕСТЕ." },
  { id: "dinner-6", topic: "dinner", greetingKey: "slushai", text: "Слушай, а вечером — ужин вдвоём? В МЕСТЕ можно предложить встречу или откликнуться на чужую." },
  { id: "dinner-7", topic: "dinner", greetingKey: "gotov", text: "Готов к спокойному ужину с компанией? 🍽 Проверь МЕСТО — там бывают такие встречи на вечер." },
  { id: "dinner-8", topic: "dinner", greetingKey: "segodnya", text: "Сегодня вечером можно поужинать не в одиночку. Загляни в МЕСТО и посмотри варианты." },
  { id: "dinner-9", topic: "dinner", greetingKey: "a_chto_esli", text: "А что если ужин сегодня — с кем-то? В МЕСТЕ можно найти компанию или предложить своё время." },

  // --- Прогулка ---
  { id: "walk-1", topic: "walk", greetingKey: "dobroe_utro", text: "Доброе утро! Свежий воздух и компания — неплохое начало дня. Посмотри в МЕСТЕ, кто выбирается на прогулку." },
  { id: "walk-2", topic: "walk", greetingKey: "kak_tebe", text: "Как тебе идея прогуляться сегодня не одному? В МЕСТЕ можно найти компанию или предложить свой маршрут." },
  { id: "walk-3", topic: "walk", greetingKey: "nu_chto", text: "Ну что, прогуляемся? ✌️ После дел можно выйти на воздух — посмотри, кто собирается в МЕСТЕ." },
  { id: "walk-4", topic: "walk", greetingKey: "privet", text: "Привет! Если будет свободный час — прогулка с компанией звучит неплохо. Загляни в МЕСТО." },
  { id: "walk-5", topic: "walk", greetingKey: "utro_slovo", text: "Утро — хороший повод пройтись пешком. В МЕСТЕ можно найти того, кто тоже не прочь прогуляться." },
  { id: "walk-6", topic: "walk", greetingKey: "slushai", text: "Слушай, а если сегодня прогулка вдвоём? В МЕСТЕ иногда предлагают такие встречи — или сам заведи свою." },
  { id: "walk-7", topic: "walk", greetingKey: "gotov", text: "Готов пройтись и заодно познакомиться? 👟 Проверь МЕСТО — там можно найти компанию на прогулку." },
  { id: "walk-8", topic: "walk", greetingKey: "segodnya", text: "Сегодня можно выбраться на прогулку не в одиночестве. Посмотри, что предлагают в МЕСТЕ." },
  { id: "walk-9", topic: "walk", greetingKey: "a_chto_esli", text: "А что если вечером — прогулка? В МЕСТЕ можно найти компанию или предложить свой маршрут." },

  // --- Своё предложение (без конкретной категории) ---
  { id: "custom-1", topic: "custom", greetingKey: "dobroe_utro", text: "Доброе утро! Если ни одна готовая идея не зацепила — в МЕСТЕ можно предложить своё. Загляни, вдруг кто-то откликнется." },
  { id: "custom-2", topic: "custom", greetingKey: "kak_tebe", text: "Как насчёт того, чтобы сегодня предложить свою идею для встречи? В МЕСТЕ это можно сделать за пару минут." },
  { id: "custom-3", topic: "custom", greetingKey: "nu_chto", text: "Ну что, сегодня есть план или пока нет? В МЕСТЕ можно посмотреть, что предлагают другие, или придумать своё." },
  { id: "custom-4", topic: "custom", greetingKey: "privet", text: "Привет! Если хочется чего-то не по шаблону — в МЕСТЕ можно создать свою встречу под любое настроение." },
  { id: "custom-5", topic: "custom", greetingKey: "utro_slovo", text: "Утро — хорошее время решить, чем занять день. Загляни в МЕСТО: там можно найти встречу или предложить свою." },
  { id: "custom-6", topic: "custom", greetingKey: "slushai", text: "Слушай, а если сегодня — что-то своё? В МЕСТЕ можно предложить любую идею, не только из готового списка." },
  { id: "custom-7", topic: "custom", greetingKey: "gotov", text: "Готов провести день не в одиночестве? В МЕСТЕ можно посмотреть предложения других или создать своё." },
  { id: "custom-8", topic: "custom", greetingKey: "segodnya", text: "Сегодня хороший день, чтобы попробовать что-то новое с компанией. Проверь МЕСТО — там разные форматы встреч." },
  { id: "custom-9", topic: "custom", greetingKey: "a_chto_esli", text: "А что если сегодня — своя идея? В МЕСТЕ можно предложить любой формат встречи, какой захочется." },
];
ENDOFFILE

mkdir -p "lib/morning-reminders"
cat > "lib/morning-reminders/pick-message.ts" << 'ENDOFFILE'
import { MORNING_REMINDER_MESSAGES, type ReminderMessage } from "@/lib/morning-reminders/message-bank";

export interface ReminderHistoryEntry {
  messageId: string | null;
  topic: string | null;
  greetingKey: string | null;
}

/**
 * Выбирает следующее сообщение для пользователя с учётом истории (см. ТЗ,
 * раздел 3 "Разнообразие"):
 *   1. не повторяет текст, пока не использован весь банк;
 *   2. не повторяет тему, которая была в прошлый раз;
 *   3. не использует приветствие, которое было в последних 5 сообщениях.
 *
 * history — уже отправленные сообщения этому пользователю, НОВЫЕ СНАЧАЛА
 * (history[0] — самое недавнее). Правила применяются по порядку строгости;
 * если после всех трёх фильтров кандидатов не осталось — ослабляем самое
 * нестрогое правило первым (лучше повторить приветствие, чем совсем не
 * прислать сообщение), и только в совсем крайнем случае разрешаем полный
 * повтор текста.
 */
export function pickNextMessage(history: ReminderHistoryEntry[]): ReminderMessage {
  const usedMessageIds = new Set(history.map((h) => h.messageId).filter((id): id is string => !!id));
  const lastTopic = history[0]?.topic ?? null;
  const recentGreetings = new Set(
    history.slice(0, 5).map((h) => h.greetingKey).filter((g): g is string => !!g)
  );

  // Весь банк использован — начинаем заново (иначе после ~9 сообщений на
  // тему пользователь просто перестал бы получать напоминания вовсе).
  const bankExhausted = MORNING_REMINDER_MESSAGES.every((m) => usedMessageIds.has(m.id));
  const notUsedPool = bankExhausted
    ? MORNING_REMINDER_MESSAGES
    : MORNING_REMINDER_MESSAGES.filter((m) => !usedMessageIds.has(m.id));

  const attempts: Array<(m: ReminderMessage) => boolean> = [
    (m) => m.topic !== lastTopic && !recentGreetings.has(m.greetingKey),
    (m) => m.topic !== lastTopic, // ослабляем правило приветствий первым
    () => true, // в крайнем случае — любое неиспользованное сообщение
  ];

  for (const passes of attempts) {
    const candidates = notUsedPool.filter(passes);
    if (candidates.length > 0) {
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      if (picked) return picked;
    }
  }

  // Теоретически недостижимо (banka из 63 сообщений на 7 тем), но на
  // случай пустого банка — берём случайное сообщение вообще без фильтров.
  const fallback = MORNING_REMINDER_MESSAGES[Math.floor(Math.random() * MORNING_REMINDER_MESSAGES.length)];
  if (fallback) return fallback;
  // Совсем крайний случай — банк пуст (невозможно при текущих данных).
  throw new Error("MORNING_REMINDER_MESSAGES пуст — нечего выбирать");
}
ENDOFFILE

mkdir -p "lib/morning-reminders"
cat > "lib/morning-reminders/schedule.ts" << 'ENDOFFILE'
import type { createAdminClient } from "@/lib/supabase/admin";
import { getCityUtcOffset } from "@/lib/data/city-timezones";

const MIN_GAP_DAYS = 2; // "не менее 48 часов между сообщениями" — в календарных днях между датами
const MIN_HOURS_AFTER_SIGNUP = 48;
const WINDOW_START_HOUR = 9;
const WINDOW_END_HOUR = 11;

/** Понедельник ISO-недели, которой принадлежит дата (в UTC-календарных сутках). */
function isoWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // воскресенье = 0 → 7, чтобы неделя начиналась с понедельника
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000)));
}

/** Случайно выбирает до targetCount дат из candidates так, чтобы между любыми двумя было не меньше MIN_GAP_DAYS. */
function pickSpacedDays(candidates: Date[], targetCount: number): Date[] {
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const chosen: Date[] = [];
  for (const date of shuffled) {
    if (chosen.every((c) => daysBetween(c, date) >= MIN_GAP_DAYS)) {
      chosen.push(date);
      if (chosen.length >= targetCount) break;
    }
  }
  return chosen.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Планирует утренние напоминания на текущую неделю для пользователей, у
 * которых ещё нет ни одной запланированной записи на эту неделю —
 * идемпотентно: повторный запуск в течение той же недели ничего не
 * задваивает (проверяем существование по week_start, а сама вставка
 * дополнительно защищена уникальным индексом в БД).
 *
 * Специально НЕ планирует "наперёд" будущие недели — только текущую,
 * от сегодняшнего дня до воскресенья. Так проще: не нужно ничего отменять
 * при отключении напоминаний или смене города/часового пояса, а
 * следующая неделя просто получит свежее расписание при следующем запуске.
 */
export async function scheduleCurrentWeekReminders(admin: ReturnType<typeof createAdminClient>): Promise<{
  scheduledUsers: number;
  scheduledSlots: number;
}> {
  const now = new Date();
  const weekStart = isoWeekStart(now);
  const weekStartIso = weekStart.toISOString().slice(0, 10);

  // Дни этой недели, которые ещё не прошли (сегодня включительно) — на
  // случай, если фича включена/пользователь зарегистрирован в середине
  // недели, планируем только оставшиеся дни.
  const remainingDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    if (day.getTime() >= new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime()) {
      remainingDays.push(day);
    }
  }
  if (remainingDays.length === 0) return { scheduledUsers: 0, scheduledSlots: 0 };

  // Пользователи, у которых уже ЕСТЬ расписание на эту неделю — пропускаем
  // целиком (идемпотентность при повторном запуске).
  const { data: alreadyScheduled } = await admin
    .from("morning_reminders")
    .select("user_id")
    .eq("week_start", weekStartIso);
  const alreadyScheduledIds = new Set((alreadyScheduled ?? []).map((r) => r.user_id));

  const { data: candidates } = await admin
    .from("users")
    .select("id, city, created_at")
    .eq("morning_reminders_enabled", true)
    .eq("moderation_status", "active");

  if (!candidates) return { scheduledUsers: 0, scheduledSlots: 0 };

  const rowsToInsert: {
    user_id: string;
    week_start: string;
    slot_index: number;
    scheduled_at: string;
    status: string;
  }[] = [];

  let scheduledUsers = 0;

  for (const user of candidates) {
    if (alreadyScheduledIds.has(user.id)) continue;

    const signupCutoff = new Date(new Date(user.created_at).getTime() + MIN_HOURS_AFTER_SIGNUP * 60 * 60 * 1000);
    const eligibleDays = remainingDays.filter((d) => addDays(d, 1).getTime() > signupCutoff.getTime());
    if (eligibleDays.length === 0) continue; // слишком свежая регистрация — подождём следующей недели

    const targetCount = Math.min(eligibleDays.length, Math.random() < 0.5 ? 2 : 3);
    const chosenDays = pickSpacedDays(eligibleDays, targetCount);
    if (chosenDays.length === 0) continue;

    const offsetHours = getCityUtcOffset(user.city);

    chosenDays.forEach((day, slotIndex) => {
      const randomMinuteOfWindow = Math.floor(Math.random() * (WINDOW_END_HOUR - WINDOW_START_HOUR) * 60);
      const localHour = WINDOW_START_HOUR + Math.floor(randomMinuteOfWindow / 60);
      const localMinute = randomMinuteOfWindow % 60;
      // День+время указаны в местном времени пользователя — переводим в UTC
      // вычитанием смещения (местное = UTC + offset ⇒ UTC = местное - offset).
      const scheduledUtc = new Date(
        Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), localHour - offsetHours, localMinute)
      );
      // Не планируем момент, который уже прошёл (например, сегодняшний
      // день, а случайное время внутри окна уже позади) — такой слот
      // никогда не будет отправлен, и в этом нет ничего страшного, но
      // корректнее просто пропустить его, чем создавать заведомо мёртвую запись.
      if (scheduledUtc.getTime() <= now.getTime()) return;

      rowsToInsert.push({
        user_id: user.id,
        week_start: weekStartIso,
        slot_index: slotIndex,
        scheduled_at: scheduledUtc.toISOString(),
        status: "pending",
      });
    });

    scheduledUsers++;
  }

  if (rowsToInsert.length > 0) {
    // upsert с ignoreDuplicates — если строка для (user_id, week_start,
    // slot_index) уже существует (например, из-за гонки параллельных
    // запусков cron), просто пропускаем её вместо ошибки.
    await admin.from("morning_reminders").upsert(rowsToInsert, {
      onConflict: "user_id,week_start,slot_index",
      ignoreDuplicates: true,
    });
  }

  return { scheduledUsers, scheduledSlots: rowsToInsert.length };
}
ENDOFFILE

mkdir -p "lib/morning-reminders"
cat > "lib/morning-reminders/send.ts" << 'ENDOFFILE'
import { GrammyError } from "grammy";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { getCityUtcOffset } from "@/lib/data/city-timezones";
import { pickNextMessage, type ReminderHistoryEntry } from "@/lib/morning-reminders/pick-message";

// Сколько времени после запланированного момента ещё можно отправить
// сообщение (например, cron не успел на предыдущем тике) — но не позже
// конца утреннего окна пользователя, чтобы не "переносить на ночь" (см. ТЗ).
const LATE_SEND_GRACE_MINUTES = 30;

function localDateKey(utcDate: Date, offsetHours: number): string {
  const local = new Date(utcDate.getTime() + offsetHours * 60 * 60 * 1000);
  return `${local.getUTCFullYear()}-${local.getUTCMonth()}-${local.getUTCDate()}`;
}

/**
 * Отправляет все "созревшие" (scheduled_at <= сейчас) напоминания со
 * статусом pending. Рассчитана на частый запуск (см. vercel.json) —
 * каждый вызов забирает то, что успело подойти по времени, ничего не
 * копит и не переносит на ночь.
 *
 * Защита от дублей при нескольких экземплярах/повторных запусках —
 * атомарный захват строки (UPDATE ... WHERE status='pending', с select
 * результата): если строку уже забрал другой процесс, select вернёт
 * пусто, и мы просто пропускаем её вместо повторной отправки.
 */
export async function sendDueMorningReminders(admin: ReturnType<typeof createAdminClient>): Promise<{
  sent: number;
  skipped: number;
}> {
  const now = new Date();

  const { data: due } = await admin
    .from("morning_reminders")
    .select("id, user_id, scheduled_at")
    .eq("status", "pending")
    .lte("scheduled_at", now.toISOString())
    .limit(200);

  if (!due || due.length === 0) return { sent: 0, skipped: 0 };

  let sent = 0;
  let skipped = 0;

  for (const reminder of due) {
    const { data: user } = await admin
      .from("users")
      .select("id, telegram_id, city, morning_reminders_enabled, moderation_status, last_active_at")
      .eq("id", reminder.user_id)
      .maybeSingle();

    if (!user || !user.morning_reminders_enabled || user.moderation_status !== "active") {
      await admin.from("morning_reminders").update({ status: "skipped_disabled" }).eq("id", reminder.id).eq("status", "pending");
      skipped++;
      continue;
    }

    const offsetHours = getCityUtcOffset(user.city);

    // "Пропущенные сообщения не отправляй пачкой и не переноси на ночь" —
    // если момент давно прошёл (за пределами окна + запас), просто
    // отменяем этот слот, а не шлём его посреди дня/ночи.
    const scheduledAt = new Date(reminder.scheduled_at);
    const minutesLate = (now.getTime() - scheduledAt.getTime()) / 60000;
    if (minutesLate > LATE_SEND_GRACE_MINUTES) {
      await admin.from("morning_reminders").update({ status: "cancelled" }).eq("id", reminder.id).eq("status", "pending");
      skipped++;
      continue;
    }

    // Уже заходил в приложение сегодня (по местному времени) — не
    // напоминаем повторно в тот же день.
    if (user.last_active_at && localDateKey(new Date(user.last_active_at), offsetHours) === localDateKey(now, offsetHours)) {
      await admin.from("morning_reminders").update({ status: "skipped_active" }).eq("id", reminder.id).eq("status", "pending");
      skipped++;
      continue;
    }

    // Атомарный захват — если проиграли гонку другому запуску, claimed
    // будет пустым и мы просто идём дальше.
    const { data: claimed } = await admin
      .from("morning_reminders")
      .update({ status: "sending" })
      .eq("id", reminder.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const { data: historyRows } = await admin
      .from("morning_reminders")
      .select("message_id, topic, greeting_key, sent_at")
      .eq("user_id", user.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false });

    const history: ReminderHistoryEntry[] = (historyRows ?? []).map((h) => ({
      messageId: h.message_id,
      topic: h.topic,
      greetingKey: h.greeting_key,
    }));

    const message = pickNextMessage(history);

    try {
      await sendReminderMessage(user.telegram_id, message.text);
      await admin
        .from("morning_reminders")
        .update({
          status: "sent",
          message_id: message.id,
          topic: message.topic,
          greeting_key: message.greetingKey,
          sent_at: new Date().toISOString(),
        })
        .eq("id", reminder.id);
      sent++;
    } catch (err) {
      const blocked = err instanceof GrammyError && err.error_code === 403;
      if (blocked) {
        // Заблокировал бота или удалил аккаунт — прекращаем попытки
        // насовсем, а не только для этого слота.
        await admin.from("users").update({ morning_reminders_enabled: false }).eq("id", user.id);
        await admin.from("morning_reminders").update({ status: "failed" }).eq("id", reminder.id);
      } else {
        // Временная ошибка — возвращаем в pending, чтобы повторить на
        // следующем тике cron (см. LATE_SEND_GRACE_MINUTES — не бесконечно).
        console.error(`sendDueMorningReminders — временная ошибка отправки (${reminder.id}):`, err);
        await admin.from("morning_reminders").update({ status: "pending" }).eq("id", reminder.id);
      }
      skipped++;
    }
  }

  return { sent, skipped };
}

async function sendReminderMessage(telegramId: number, text: string): Promise<void> {
  const appUrl = process.env.APP_URL;
  const { InlineKeyboard } = await import("grammy");
  const keyboard = new InlineKeyboard();
  if (appUrl) keyboard.webApp("Открыть МЕСТО", appUrl).row();
  keyboard.text("Отключить напоминания", "disable_morning_reminders");

  await getBot().api.sendMessage(telegramId, text, { reply_markup: keyboard });
}
ENDOFFILE

mkdir -p "app/api/cron/schedule-morning-reminders"
cat > "app/api/cron/schedule-morning-reminders/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleCurrentWeekReminders } from "@/lib/morning-reminders/schedule";

/**
 * GET /api/cron/schedule-morning-reminders
 *
 * Раз в день (см. vercel.json) досоздаёт расписание утренних напоминаний
 * на текущую неделю для пользователей, у которых его ещё нет — так
 * подхватываются и новые регистрации в течение недели, а не только
 * существующие пользователи по понедельникам.
 *
 * Идемпотентно само по себе (см. lib/morning-reminders/schedule.ts) —
 * повторный или параллельный запуск ничего не задваивает.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await scheduleCurrentWeekReminders(admin);

  return NextResponse.json(result);
}
ENDOFFILE

mkdir -p "app/api/cron/send-morning-reminders"
cat > "app/api/cron/send-morning-reminders/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDueMorningReminders } from "@/lib/morning-reminders/send";

/**
 * GET /api/cron/send-morning-reminders
 *
 * Часто (см. vercel.json) проверяет, не подошло ли время отправить
 * кому-то утреннее напоминание, и отправляет — с полным набором проверок
 * (согласие, активность сегодня, попадание в окно) внутри
 * lib/morning-reminders/send.ts.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await sendDueMorningReminders(admin);

  return NextResponse.json(result);
}
ENDOFFILE

mkdir -p "lib/telegram"
cat > "lib/telegram/bot.ts" << 'ENDOFFILE'
import { Bot, InlineKeyboard, Keyboard } from "grammy";
import { getSupportAiReply } from "@/lib/telegram/support-ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateSubscription } from "@/lib/subscriptions/server";
import type { Plan } from "@/lib/subscriptions/limits";

function getAdminId(): number | null {
  const first = (process.env.ADMIN_TELEGRAM_IDS ?? "").split(",")[0]?.trim();
  const id = Number(first);
  return first && !Number.isNaN(id) ? id : null;
}

/**
 * Бот собирается лениво (не на верхнем уровне модуля) — токен читается из
 * process.env только в момент первого запроса, а не во время сборки/импорта,
 * чтобы отсутствие переменной окружения на этапе build не роняло весь проект.
 */
let botInstance: Bot | null = null;

export function getBot(): Bot {
  if (botInstance) return botInstance;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Отсутствует TELEGRAM_BOT_TOKEN в переменных окружения");

  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("Отсутствует APP_URL в переменных окружения");
  // Присваиваем в новую переменную: TypeScript не переносит сужение типа
  // (narrowing) из внешней области видимости внутрь вложенных функций —
  // без этого openAppKeyboard() ниже видел бы appUrl как `string | undefined`.
  const validatedAppUrl: string = appUrl;

  const bot = new Bot(token);

  function openAppKeyboard() {
    return new InlineKeyboard().webApp("Открыть приложение", validatedAppUrl);
  }

  // Постоянная клавиатура снизу экрана (не инлайн-кнопка под одним
  // сообщением, а закреплённая панель, которая остаётся видна всегда,
  // пока её не заменят/не уберут) — именно то, что попросил пользователь:
  // кнопка "Купить подписку" прямо под полем ввода сообщения.
  function persistentKeyboard() {
    return new Keyboard()
      .webApp("Открыть приложение", validatedAppUrl)
      .row()
      .webApp("Купить подписку", `${validatedAppUrl}?goto=subscriptions`)
      .resized();
  }

  bot.command("start", async (ctx) => {
    await ctx.reply("Отлично, теперь запустим наше МЕСТО! 🚀🧡", { reply_markup: persistentKeyboard() });
  });

  bot.command("app", async (ctx) => {
    await ctx.reply("Открыть приложение:", { reply_markup: openAppKeyboard() });
  });

  bot.command("subscribe", async (ctx) => {
    await ctx.reply("Оформить или продлить подписку — картой, СБП или Telegram Stars:", {
      reply_markup: new InlineKeyboard().webApp("Купить подписку", `${validatedAppUrl}?goto=subscriptions`),
    });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Как это работает:\n" +
        "1. Открой приложение кнопкой ниже.\n" +
        "2. Выбери, что хочешь сделать сегодня — тренировка, кино, кофе и т.д.\n" +
        "3. Найди подходящую встречу или создай свою.\n\n" +
        "Если что-то не работает — напиши /support.",
      { reply_markup: openAppKeyboard() }
    );
  });

  bot.command("support", async (ctx) => {
    await ctx.reply(
      "Опиши проблему в этом чате — мы читаем сообщения и стараемся отвечать как можно быстрее."
    );
  });

  // Обязательная команда для ботов с платежами (требование Telegram) —
  // свериться с актуальными правилами перед продакшн-запуском:
  // https://core.telegram.org/bots/payments
  bot.command("paysupport", async (ctx) => {
    await ctx.reply(
      "Вопросы по оплате подписки (Telegram Stars): опиши проблему здесь, " +
        "укажи дату и тариф — разберёмся и, если нужно, оформим возврат через Telegram."
    );
  });

  // Оплата Telegram Stars — обязательное подтверждение ДО списания (10
  // секунд на ответ, иначе Telegram сам отменит платёж). Мы уже проверили
  // план и создали инвойс на сервере (см. create-invoice route), так что
  // здесь просто подтверждаем без дополнительных проверок.
  bot.on("pre_checkout_query", async (ctx) => {
    await ctx.answerPreCheckoutQuery(true).catch((err) => {
      console.error("answerPreCheckoutQuery failed:", err);
    });
  });

  // Реальное списание произошло — вот этот апдейт и есть источник истины
  // (п.25 ТЗ: "не доверять client-side подтверждению оплаты"). Активируем
  // подписку той же функцией, что и для оплаты через ЮKassa.
  bot.on("message:successful_payment", async (ctx) => {
    const payment = ctx.message.successful_payment;

    let payload: { userId: string; plan: Plan };
    try {
      payload = JSON.parse(payment.invoice_payload);
    } catch {
      console.error("successful_payment: не удалось разобрать invoice_payload:", payment.invoice_payload);
      return;
    }

    const admin = createAdminClient();
    const { subscriptionId } = await activateSubscription(admin, payload.userId, payload.plan);

    await admin.from("payments").insert({
      user_id: payload.userId,
      subscription_id: subscriptionId,
      plan: payload.plan,
      amount: payment.total_amount,
      currency: payment.currency,
      telegram_payment_charge_id: payment.telegram_payment_charge_id,
      status: "succeeded",
    });

    await ctx.reply(`✅ Оплата прошла — подписка «${payload.plan.toUpperCase()}» активирована на 30 дней.`, {
      reply_markup: openAppKeyboard(),
    });
  });

  // Кнопка "Отключить напоминания" под утренним сообщением (см.
  // lib/morning-reminders/) — отключает ТОЛЬКО эти приглашения, обычные
  // уведомления (заявки, чаты, отзывы) продолжают приходить как раньше.
  bot.callbackQuery("disable_morning_reminders", async (ctx) => {
    const admin = createAdminClient();
    await admin.from("users").update({ morning_reminders_enabled: false }).eq("telegram_id", ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.reply("Хорошо, больше не буду напоминать по утрам. Включить снова можно в настройках приложения в любой момент.");
  });

  // Свободный текст (не команда) в чате с ботом = обращение в поддержку.
  // Правило порядка: обработчики выше (.command(...)) уже "съедают" команды
  // и не вызывают next(), так что сюда попадают только обычные сообщения.
  bot.on("message:text", async (ctx) => {
    const userMessage = ctx.message.text;
    const { reply, needsHuman } = await getSupportAiReply(userMessage);
    await ctx.reply(reply);

    const adminId = getAdminId();
    if (needsHuman && adminId) {
      const from = ctx.from;
      const who = from?.username ? `@${from.username}` : from?.first_name ?? "пользователь";
      await ctx.api
        .sendMessage(
          adminId,
          `📩 Вопрос в поддержку от ${who} (id ${from?.id}):\n\n${userMessage}\n\n— Ответ бота: ${reply}`
        )
        .catch((err) => console.error("Не удалось переслать вопрос админу:", err));
    }
  });

  bot.catch((err) => {
    console.error("Telegram bot error:", err);
  });

  // Список команд в меню бота (значок рядом с полем ввода сообщения) —
  // без этого вызова Telegram не показывает команды со стрелочки, только
  // если пользователь наберёт их вручную. Вызывается один раз при первом
  // "холодном" запуске функции (botInstance кэшируется ниже), не на каждый
  // апдейт — лишний вызов API Telegram не нужен.
  bot.api
    .setMyCommands([
      { command: "start", description: "Запустить бота" },
      { command: "app", description: "Открыть приложение" },
      { command: "subscribe", description: "Купить подписку" },
      { command: "help", description: "Как это работает" },
      { command: "support", description: "Написать в поддержку" },
    ])
    .catch((err) => console.error("setMyCommands failed:", err));

  botInstance = bot;
  return bot;
}
ENDOFFILE

mkdir -p "."
cat > "vercel.json" << 'ENDOFFILE'
{
  "crons": [
    {
      "path": "/api/cron/complete-events",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/schedule-morning-reminders",
      "schedule": "10 0 * * *"
    },
    {
      "path": "/api/cron/send-morning-reminders",
      "schedule": "*/10 * * * *"
    }
  ]
}
ENDOFFILE

mkdir -p "app/api/me/profile"
cat > "app/api/me/profile/route.ts" << 'ENDOFFILE'
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { RUSSIAN_CITIES } from "@/lib/data/russian-cities";

/**
 * GET /api/me/profile
 * Полный профиль текущего пользователя — для экрана "Профиль" (п.21 ТЗ).
 * Отдельно от /api/me (который отдаёт только userId для чата), чтобы не
 * тащить лишние данные туда, где нужен просто идентификатор.
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: user, error } = await admin
    .from("users")
    .select(
      "id, name, avatar_url, birth_date, city, bio, rating_avg, rating_count, completed_meetings_count, created_at, receipt_contact, last_active_at, morning_reminders_enabled"
    )
    .eq("id", currentUser.userId)
    .maybeSingle();

  if (error || !user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // "last_active_at" — используется утренними напоминаниями (см.
  // lib/morning-reminders/), чтобы не напоминать тому, кто уже заходил
  // сегодня. Обновляем не на КАЖДЫЙ запрос (это самый частый эндпоинт в
  // приложении — лишняя запись в базу на каждое открытие профиля), а
  // только если прошлая отметка старше 6 часов — этого с запасом хватает,
  // чтобы к моменту утренней отправки отметка была свежей.
  const lastActive = user.last_active_at ? new Date(user.last_active_at) : null;
  if (!lastActive || Date.now() - lastActive.getTime() > 6 * 60 * 60 * 1000) {
    await admin.from("users").update({ last_active_at: new Date().toISOString() }).eq("id", currentUser.userId);
  }

  const [{ count: eventsOrganizedCount }, { count: eventsAttendedCount }] = await Promise.all([
    admin.from("events").select("*", { count: "exact", head: true }).eq("organizer_id", currentUser.userId),
    admin
      .from("event_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", currentUser.userId)
      .eq("role", "participant"),
  ]);

  return NextResponse.json({
    id: user.id,
    name: user.name,
    avatarUrl: user.avatar_url,
    age: calculateAge(user.birth_date),
    city: user.city,
    bio: user.bio,
    ratingAvg: user.rating_avg,
    ratingCount: user.rating_count,
    completedMeetingsCount: user.completed_meetings_count,
    receiptContact: user.receipt_contact,
    morningRemindersEnabled: user.morning_reminders_enabled,
    eventsOrganizedCount: eventsOrganizedCount ?? 0,
    eventsAttendedCount: eventsAttendedCount ?? 0,
    memberSince: user.created_at,
  });
}

function calculateAge(birthDateIso: string): number {
  const birthDate = new Date(birthDateIso);
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

/**
 * PATCH /api/me/profile
 * Body: { name?: string, bio?: string, city?: string }
 * Смена города — только из фиксированного списка городов России
 * (lib/data/russian-cities.ts), как и везде в приложении, где выбирается
 * город (поиск, лента) — иначе рассинхронизация с фильтрами по городу.
 */
export async function PATCH(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const update: Record<string, string | boolean> = {};

  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 50) {
      return NextResponse.json({ error: "invalid_name" }, { status: 422 });
    }
    update.name = name;
  }

  if (typeof body?.bio === "string") {
    const bio = body.bio.trim();
    if (bio.length > 300) return NextResponse.json({ error: "bio_too_long" }, { status: 422 });
    update.bio = bio;
  }

  if (typeof body?.city === "string") {
    if (!RUSSIAN_CITIES.includes(body.city)) {
      return NextResponse.json({ error: "invalid_city" }, { status: 422 });
    }
    update.city = body.city;
  }

  if (typeof body?.receiptContact === "string") {
    const contact = body.receiptContact.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    const isPhone = /^\+?\d{10,15}$/.test(contact.replace(/[\s()-]/g, ""));
    if (!isEmail && !isPhone) {
      return NextResponse.json({ error: "invalid_receipt_contact" }, { status: 422 });
    }
    update.receipt_contact = isPhone ? contact.replace(/[\s()-]/g, "") : contact;
  }

  if (typeof body?.morningRemindersEnabled === "boolean") {
    update.morning_reminders_enabled = body.morningRemindersEnabled;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("users").update(update).eq("id", currentUser.userId);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  return NextResponse.json({ status: "ok" });
}
ENDOFFILE

mkdir -p "app/(app)/settings"
cat > "app/(app)/settings/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getTelegramWebApp } from "@/lib/telegram/webapp-client";
import { CityPicker } from "@/components/ui/CityPicker";

interface ProfileSummary {
  name: string;
  city: string;
  morningRemindersEnabled: boolean;
}

const SUPPORT_BOT_URL = "https://t.me/Mesto_people_bot";

export default function SettingsPage() {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [editingCity, setEditingCity] = useState(false);
  const [cityDraft, setCityDraft] = useState("");
  const [savingCity, setSavingCity] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setProfile({ name: data.name, city: data.city, morningRemindersEnabled: data.morningRemindersEnabled ?? true });
      });
  }, []);

  function handleClose() {
    getTelegramWebApp()?.close();
  }

  async function toggleMorningReminders() {
    if (!profile) return;
    const next = !profile.morningRemindersEnabled;
    setProfile({ ...profile, morningRemindersEnabled: next }); // оптимистично — переключатель не должен ждать сети
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ morningRemindersEnabled: next }),
      });
      if (!res.ok) setProfile({ ...profile, morningRemindersEnabled: !next }); // откат при ошибке
    } catch {
      setProfile({ ...profile, morningRemindersEnabled: !next });
    }
  }

  function openCityEditor() {
    setCityDraft(profile?.city ?? "");
    setCityError(null);
    setEditingCity(true);
  }

  async function saveCity() {
    if (!cityDraft.trim() || cityDraft === profile?.city) {
      setEditingCity(false);
      return;
    }
    setSavingCity(true);
    setCityError(null);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: cityDraft }),
      });
      if (!res.ok) {
        setCityError("Не получилось сохранить город.");
        return;
      }
      setProfile((prev) => (prev ? { ...prev, city: cityDraft } : prev));
      setEditingCity(false);
    } finally {
      setSavingCity(false);
    }
  }

  return (
    <div className="px-5 py-4">
      <div className="mb-5 flex items-center gap-3">
        <Link href="/profile" aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </Link>
        <h1 className="text-title">Настройки</h1>
      </div>

      <Section title="Аккаунт">
        <Row href="/profile" label="Профиль" value={profile ? profile.name : undefined} icon="/brand/icons/profile.svg" />
        <Row href="/subscriptions" label="Мой тариф" icon="/brand/icons/gift.svg" />
        <Row href="/notifications" label="Уведомления" icon="/brand/icons/bell.svg" />
        {profile && (
          <ToggleRow
            label="Утренние приглашения"
            description="Иногда предлагаем идею на день — не чаще пары раз в неделю"
            checked={profile.morningRemindersEnabled}
            onChange={toggleMorningReminders}
          />
        )}
        <button onClick={openCityEditor} className="block w-full text-left">
          <div className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card">
            <Image src="/brand/icons/location.svg" alt="" width={18} height={18} />
            <span className="flex-1 text-sm text-ink-900">Город</span>
            {profile?.city && <span className="text-sm text-ink-400">{profile.city}</span>}
            <span className="text-ink-400">›</span>
          </div>
        </button>
      </Section>

      <Section title="Помощь">
        <Row external href={SUPPORT_BOT_URL} label="Написать в поддержку" icon="/brand/icons/help.svg" />
      </Section>

      <Section title="О приложении">
        <div className="rounded-card bg-white p-4 shadow-card">
          <div className="relative mb-4 h-6 w-24">
            <Image src="/brand/logo/wordmark-purple.svg" alt="МЕСТО" fill className="object-contain object-left" />
          </div>
          <p className="mb-2 text-sm font-medium text-ink-900">
            МЕСТО — когда есть куда пойти, но не с кем.
          </p>
          <p className="mb-2 text-sm text-ink-600">
            Приложение, которое объединяет людей через реальные планы и события.
          </p>
          <p className="mb-2 text-sm text-ink-600">
            Хочешь сходить в кино, позавтракать, выпить кофе, поужинать, прогуляться или потренироваться —
            создай встречу или присоединись к уже существующей.
          </p>
          <p className="text-sm text-ink-600">
            Здесь не нужно бесконечно листать анкеты и искать повод для знакомства. Сначала появляется место,
            идея или занятие — потом люди, которые хотят того же.
          </p>
        </div>

        <Row href="/legal/offer" label="Публичная оферта" icon="/brand/icons/info.svg" />
        <Row href="/legal/privacy" label="Политика конфиденциальности" icon="/brand/icons/lock.svg" />
      </Section>

      <button
        onClick={handleClose}
        className="mt-6 w-full rounded-pill border border-lavender-200 bg-white py-3.5 text-sm font-medium text-ink-600"
      >
        Закрыть приложение
      </button>

      {editingCity && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30"
          onClick={() => setEditingCity(false)}
        >
          <div
            className="rounded-t-sheet bg-white p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <h2 className="text-title mb-4">Город</h2>
            <CityPicker value={cityDraft} onChange={setCityDraft} autoFocus dropdownDirection="up" />
            {cityError && <p className="mt-2 text-sm text-red-600">{cityError}</p>}
            <button
              onClick={saveCity}
              disabled={savingCity || !cityDraft.trim()}
              className="mt-4 w-full rounded-pill bg-brand-gradient py-3.5 text-sm font-semibold text-white shadow-cta disabled:opacity-60"
            >
              {savingCity ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-ink-400">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  icon,
  href,
  external = false,
}: {
  label: string;
  value?: string;
  icon: string;
  href?: string;
  external?: boolean;
}) {
  const content = (
    <div className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card">
      <Image src={icon} alt="" width={18} height={18} />
      <span className="flex-1 text-sm text-ink-900">{label}</span>
      {value && <span className="text-sm text-ink-400">{value}</span>}
      {href && <span className="text-ink-400">›</span>}
    </div>
  );

  if (!href) return content;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return <Link href={href}>{content}</Link>;
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className="flex w-full items-center gap-3 rounded-card bg-white p-4 text-left shadow-card"
    >
      <div className="flex-1">
        <span className="block text-sm text-ink-900">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-400">{description}</span>}
      </div>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-pill transition-colors ${checked ? "bg-brand-gradient" : "bg-lavender-200"}`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </span>
    </button>
  );
}
ENDOFFILE

