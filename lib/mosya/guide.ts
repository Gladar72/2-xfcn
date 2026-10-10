"use client";

import { useEffect } from "react";
import type { MosyaPose } from "@/components/brand/Mosya";
import { peek } from "./peek";

/**
 * Мося-гид: после регистрации в каждом разделе один раз выглядывает и
 * объясняет, что здесь. При повторных заходах не появляется — только
 * когда человек регистрируется заново (startGuideTour() из анкеты).
 */
export const GUIDE: Record<string, [MosyaPose, string]> = {
  feed: ["wave", "Привет! Это главная. Выбери, чем хочешь заняться, ниже — встречи рядом. Жми «Я иду» — организатор получит заявку"],
  map: ["phone", "Это карта: все встречи рядом. Приближай — метки рассыпаются, отдаляй — собираются в цифру"],
  search: ["think", "Здесь все встречи списком. Пиши, что хочешь — кофе, бег, кино, — и сужай фильтрами"],
  chats: ["phone", "Тут чаты встреч. Они появляются, когда организатор принимает твою заявку"],
  profile: ["sit", "Твой профиль. Добавь фото и пару слов о себе — таких чаще зовут"],
  create: ["wave", "Здесь создаёшь свою встречу. Выбери, что планируешь, или придумай своё — жми звёздочку"],
  cover: ["glasses", "Короткое название и картинка решают, придут ли люди. Загрузи своё фото, а если не сможешь — я подберу обложку сам. Красиво, без колхоза 😉"],
  when: ["phone", "Выбери день и время, потом место — начни вводить, адрес подставлю сам"],
  event: ["glasses", "Карточка встречи: кто организатор, кто идёт, адрес и маршрут. Чат откроется, когда тебя примут"],
  business: ["glasses", "Раздел для бизнеса: кафе, бары и студии создают события на общей карте города. Гости приходят по заявке и платят на месте"],
  notifications: ["think", "Уведомления: ответы на заявки, напоминания и просьбы оценить встречу. Всё это приходит и в Telegram"],
  settings: ["think", "Настройки: город, уведомления, приватность и документы сервиса"],
  subscriptions: ["glasses", "Подписка нужна, чтобы создавать свои встречи. Откликаться на чужие можно и без неё"],
  ticket: ["wave", "Это твой билет. Назови номер организатору на входе, оплата — ему лично"],
  myEvents: ["think", "Здесь твои встречи: куда идёшь и что организуешь. Новые заявки видно сразу"],
};

const KEY = "mesto_guide_v1";

interface GuideState {
  active: boolean;
  seen: string[];
}

function read(): GuideState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GuideState) : null;
  } catch {
    return null;
  }
}

function write(s: GuideState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* хранилище недоступно — гид просто не покажется повторно в этой сессии */
  }
}

/** Вызывается при регистрации: включает тур по разделам заново. */
export function startGuideTour() {
  write({ active: true, seen: [] });
}

/** Показать подсказку раздела, если человек здесь впервые после регистрации. */
export function showGuide(id: string, opts?: { low?: boolean; delay?: number }) {
  const g = GUIDE[id];
  const st = read();
  if (!g || !st?.active || st.seen.includes(id)) return false;
  st.seen.push(id);
  write(st);
  setTimeout(() => peek({ pose: g[0], text: g[1], low: opts?.low, ms: Math.max(5000, g[1].length * 62) }), opts?.delay ?? 750);
  return true;
}

/** Хук: показать подсказку раздела при первом открытии. */
export function useGuide(id: string, opts?: { low?: boolean; when?: boolean }) {
  const when = opts?.when ?? true;
  useEffect(() => {
    if (when) showGuide(id, { low: opts?.low });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, when]);
}
