/** Формат сообщения — как отдаёт /api/conversations/[id]/messages (и broadcast "message"). */
export interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
  userIds: string[];
}

export interface ReplyRef {
  id: string;
  senderId: string;
  content: string;
  imageUrl: string | null;
  deleted: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  replyTo: ReplyRef | null;
  reactions: Reaction[];
  /** Локальное: ещё отправляется (временный id) / не ушло. */
  pending?: boolean;
  failed?: boolean;
  /** Локальное фото до загрузки на сервер. */
  localImage?: string | null;
}

export interface ChatMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  lastReadAt: string | null;
  lastActiveAt: string | null;
}

export interface ChatInfo {
  messages: ChatMessage[];
  hasMore: boolean;
  eventTitle: string | null;
  eventStatus: string | null;
  eventId: string | null;
  eventPhotoUrl: string | null;
  members: ChatMember[];
}

/** Время из ISO-строки. Postgres отдаёт микросекунды (.123456+00:00) — режем до миллисекунд,
 *  чтобы одинаково парсилось на любом JS-движке. */
export function ms(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isNaN(t) ? 0 : t;
}

/** «в сети» — был активен последние 2 минуты. */
export function isOnline(lastActiveAt: string | null | undefined): boolean {
  if (!lastActiveAt) return false;
  return Date.now() - ms(lastActiveAt) < 2 * 60_000;
}

export function lastSeenText(lastActiveAt: string | null | undefined): string {
  if (!lastActiveAt) return "был(а) давно";
  const t = ms(lastActiveAt);
  const min = Math.floor((Date.now() - t) / 60_000);
  if (min < 2) return "в сети";
  if (min < 60) return `был(а) ${min} мин назад`;
  const h = Math.floor(min / 60);
  const d = new Date(t);
  const time = timeOf(lastActiveAt);
  if (h < 24 && new Date().getDate() === d.getDate()) return `был(а) сегодня в ${time}`;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (y.toDateString() === d.toDateString()) return `был(а) вчера в ${time}`;
  return `был(а) ${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`;
}

export function timeOf(iso: string): string {
  const d = new Date(ms(iso));
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Подпись дня над сообщениями: Сегодня / Вчера / 12 октября. */
export function dayLabel(iso: string): string {
  const d = new Date(ms(iso));
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Сегодня";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

export function sameDay(a: string, b: string): boolean {
  return new Date(ms(a)).toDateString() === new Date(ms(b)).toDateString();
}

/** Сообщения, отправленные одним человеком подряд (< 5 мин), рисуем «пачкой». */
export function sameGroup(a: ChatMessage | undefined, b: ChatMessage | undefined): boolean {
  if (!a || !b) return false;
  return a.senderId === b.senderId && sameDay(a.createdAt, b.createdAt) && Math.abs(ms(a.createdAt) - ms(b.createdAt)) < 5 * 60_000;
}

/** Пересчёт реакций из broadcast-формата {emoji, userIds}. */
export function shapeReactions(list: { emoji: string; userIds: string[] }[], me: string | null): Reaction[] {
  return list.map((r) => ({ emoji: r.emoji, userIds: r.userIds, count: r.userIds.length, mine: !!me && r.userIds.includes(me) }));
}

/** Прочитал ли участник сообщение (сравниваем как даты: форматы ISO у БД и broadcast разные). */
export function hasRead(m: { lastReadAt: string | null }, createdAt: string): boolean {
  return !!m.lastReadAt && ms(m.lastReadAt) >= ms(createdAt);
}
