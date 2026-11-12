import { ApiReadError, getJson } from "@/lib/http/get-json";

/** A broken or partial API response is not an empty list. */
export async function getItems<T>(url: string, signal?: AbortSignal): Promise<{ items: T[]; hasMore: boolean }> {
  const data = await getJson<{ items?: unknown; hasMore?: boolean }>(url, signal);
  if (!Array.isArray(data.items)) throw new ApiReadError(502, "invalid_items");
  return { items: data.items as T[], hasMore: data.hasMore === true };
}

/** Publish each loaded page promptly, but never call an interrupted catalogue complete. */
export async function getAllItems<T extends { id: string }>(url: string, signal?: AbortSignal, onPage?: (items: T[]) => void): Promise<T[]> {
  const params = new URL(url, "https://mesto.local");
  const seen = new Map<string, T>();
  for (let page = 0; ; page++) {
    params.searchParams.set("page", String(page));
    const data = await getItems<T>(`${params.pathname}${params.search}`, signal);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const before = seen.size;
    data.items.forEach(item => seen.set(item.id, item));
    if (data.hasMore && seen.size === before) throw new ApiReadError(502, "invalid_pagination");
    const items = [...seen.values()];
    onPage?.(items);
    if (!data.hasMore) return items;
  }
}
