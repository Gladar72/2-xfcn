import { useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { useFocusEffect } from "expo-router";

/**
 * Мося-гид: после регистрации в каждом разделе один раз выглядывает и
 * объясняет, что здесь (как в веб-версии, lib/mosya/guide.ts).
 * Показ — компонент <MosyaPeekHost/> в корневом layout.
 */
export type GuidePose = "mosya_wave" | "mosya_glasses" | "mosya_phone" | "mosya_think" | "mosya_sit" | "mosya_jump" | "mosya_run";
export type Tip = { pose: GuidePose; text: string };

const t = (pose: GuidePose, text: string): Tip => ({ pose, text });

export const GUIDE: Record<string, Tip[]> = {
  feed: [
    t("mosya_wave", "Привет! Я Мося 👋 Жми «+» внизу — создашь свою встречу: кофе, спорт, кино, прогулка — что угодно"),
    t("mosya_glasses", "Чуть ниже на главной — «Для бизнеса»: тут кафе, бары и студии размещают афишу своих событий. Есть своё дело — создай событие и для него"),
    t("mosya_phone", "А ещё ниже — встречи рядом. Жми «Я иду» — организатор получит заявку"),
  ],
  map: [t("mosya_phone", "Это карта: все встречи рядом. Приближай — метки рассыпаются, отдаляй — собираются в цифру")],
  chats: [t("mosya_phone", "Тут чаты встреч. Они появляются, когда организатор принимает твою заявку")],
  profile: [t("mosya_sit", "Твой профиль. Добавь фото и пару слов о себе — таких чаще зовут")],
  event: [t("mosya_glasses", "Карточка встречи: кто организатор, кто идёт, адрес и маршрут. Чат откроется, когда тебя примут")],
  business: [
    t("mosya_glasses", "Раздел для бизнеса: кафе, бары и студии создают события на общей карте города. Гости приходят по заявке и платят на месте"),
  ],
  notifications: [t("mosya_think", "Уведомления: ответы на заявки, напоминания и просьбы оценить встречу")],
  settings: [t("mosya_think", "Настройки: город, уведомления, приватность и документы сервиса")],
  subscription: [t("mosya_glasses", "Тариф нужен, чтобы создавать свои встречи. Откликаться на чужие можно и без него")],
  people: [t("mosya_wave", "Люди с похожими интересами в твоём городе. Листай — понравился человек, зови на встречу 😉")],
  person: [t("mosya_glasses", "Профиль человека: фото, интересы и рейтинг. Можно написать или позвать на свою встречу")],
  myEvents: [t("mosya_think", "Здесь твои встречи: куда идёшь и что организуешь. Новые заявки видно сразу")],
  city: [t("mosya_phone", "Событие из городской афиши. Билеты — у организатора, а я помогу найти компанию")],
};

const KEY = "mesto_guide_v1";
type State = { active: boolean; seen: string[] };

let cache: State | null | undefined;
async function read(): Promise<State | null> {
  if (cache !== undefined) return cache;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    cache = raw ? (JSON.parse(raw) as State) : null;
  } catch {
    cache = null;
  }
  return cache;
}
function write(s: State) {
  cache = s;
  SecureStore.setItemAsync(KEY, JSON.stringify(s)).catch(() => {});
}

/** Регистрация завершена — включаем тур по разделам. */
export function startGuideTour() {
  write({ active: true, seen: [] });
}

// Очередь подсказок для <MosyaPeekHost/>.
type Listener = (tips: Tip[] | null) => void;
let listener: Listener | null = null;
export function onGuide(l: Listener) {
  listener = l;
  return () => {
    if (listener === l) listener = null;
  };
}

async function show(id: string): Promise<boolean> {
  const tips = GUIDE[id];
  const st = await read();
  if (!tips || !st?.active || st.seen.includes(id)) return false;
  write({ ...st, seen: [...st.seen, id] });
  listener?.(tips);
  return true;
}

/** Подсказка раздела при первом открытии после регистрации; ушёл с экрана — Мося прячется. */
export function useGuide(id: string, when = true) {
  useFocusEffect(
    useCallback(() => {
      if (!when) return;
      let shown = false;
      const timer = setTimeout(() => {
        show(id).then((s) => (shown = s));
      }, 700);
      return () => {
        clearTimeout(timer);
        if (shown) listener?.(null);
      };
    }, [id, when])
  );
}
