import { api } from "./api";

export type IncomingHeart = {
  id: string;
  name: string;
  age: number | null;
  avatarUrl: string | null;
  createdAt: string;
  unread: boolean;
};

export function heartPage(cursor?: string | null, signal?: AbortSignal) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return api<{ items: IncomingHeart[]; nextCursor: string | null }>(`/api/me/hearts/inbox${query}`, { signal });
}

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function heartDestination(sender?: unknown, url?: unknown) {
  const legacyId = typeof url === "string" ? /^\/(?:people|person)\/([^/?#]+)(?:[/?#]|$)/.exec(url)?.[1] : undefined;
  const id = typeof sender === "string" && UUID.test(sender) ? sender : legacyId;
  return id && UUID.test(id) ? `/person/${id}?heart=1` : "/hearts";
}

export function heartTime(date: string) {
  const delta = Math.max(0, Date.now() - Date.parse(date));
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "Только что";
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} ч назад`;
  return new Date(date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
