/**
 * Кэш ленты — короткая память сервера на 15 секунд.
 *
 * Список встреч города (с фильтрами) одинаковый для всех, кто открывает
 * ленту в одни и те же секунды. Вместо того чтобы каждый раз спрашивать
 * базу, сервер запоминает готовый ответ базы на CACHE_TTL_MS и отдаёт его
 * следующим людям. Если в эти секунды одновременно пришли сто человек —
 * в базу уйдёт один запрос, остальные дождутся его же (общий Promise).
 *
 * Личное (заблокированные, «Ваша встреча», статус заявки, интересы для
 * сортировки) сюда НЕ попадает — оно считается для каждого человека
 * отдельно уже после кэша, в app/api/events/route.ts.
 *
 * Память у каждого экземпляра функции Vercel своя; при создании встречи
 * кэш этого экземпляра сбрасывается (clearFeedCache), чтобы автор сразу
 * видел свою встречу. В худшем случае новая встреча появится у других
 * через 15 секунд.
 */

const CACHE_TTL_MS = 15_000;
const MAX_ENTRIES = 500;

interface Entry<T> {
  expiresAt: number;
  value: Promise<T>;
}

const cache = new Map<string, Entry<unknown>>();

export async function cachedFeed<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  if (cache.size >= MAX_ENTRIES) {
    // Выкидываем просроченные, а если их нет — самую старую запись.
    for (const [k, e] of cache) if (e.expiresAt <= now) cache.delete(k);
    if (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }

  const value = load();
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, value });
  // Ошибку не кэшируем — следующий запрос попробует снова.
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

export function clearFeedCache(): void {
  cache.clear();
}
