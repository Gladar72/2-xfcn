import { getJson } from "@/lib/http/get-json";

export interface IncomingHeart {
  id: string;
  name: string;
  age: number | null;
  avatarUrl: string | null;
  createdAt: string;
  unread: boolean;
}

export function heartPage(signal: AbortSignal, cursor?: string | null) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return getJson<{ items: IncomingHeart[]; nextCursor: string | null }>(`/api/me/hearts/inbox${query}`, signal);
}

export async function incomingHearts(signal: AbortSignal) {
  const people = new Map<string, IncomingHeart>();
  let cursor: string | null = null;
  do {
    const page = await heartPage(signal, cursor);
    for (const person of page.items) {
      if (!people.has(person.id)) people.set(person.id, person);
    }
    cursor = page.nextCursor;
  } while (cursor);
  return [...people.values()];
}

export function heartTime(date: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 60000));
  if (minutes < 1) return "Только что";
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} ч назад`;
  return new Date(date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

/** Groups a single day's consecutive likes without hiding mutual hearts or other events. */
export function groupHeartRows<T extends { id: string; type: string; linkUserId?: string | null }>(items: T[]) {
  const rows: ({ kind: "item"; item: T } | { kind: "group"; key: string; count: number })[] = [];
  for (let start = 0; start < items.length;) {
    const first = items[start]!;
    rows.push({ kind: "item", item: first });
    let end = start + 1;
    if (first.type === "heart") {
      const others = new Set<string>();
      while (end < items.length && items[end]!.type === "heart") {
        const id = items[end]!.linkUserId;
        if (id && id !== first.linkUserId) others.add(id);
        end++;
      }
      if (others.size > 1) rows.push({ kind: "group", key: "more-" + first.id, count: others.size });
      else for (const item of items.slice(start + 1, end)) rows.push({ kind: "item", item });
    }
    start = end;
  }
  return rows;
}
