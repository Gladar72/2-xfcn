/**
 * Фоновая работа ПОСЛЕ ответа клиенту на Vercel.
 *
 * Просто «не ждать» промис (void promise) на Vercel нельзя: как только
 * функция ответила, её выполнение замораживается, и недоделанная работа
 * (например, рассылка в Telegram) молча обрывается. Vercel даёт для этого
 * waitUntil — то же, что делает пакет @vercel/functions, только без
 * лишней зависимости. Вне Vercel (локально) просто дожидаемся промиса.
 */
type RequestContext = { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined };

export async function runInBackground(task: () => Promise<unknown>): Promise<void> {
  const promise = task().catch((err) => console.error("runInBackground:", err));
  const ctx = (globalThis as unknown as Record<symbol, RequestContext | undefined>)[
    Symbol.for("@vercel/request-context")
  ]?.get?.();
  if (ctx?.waitUntil) {
    ctx.waitUntil(promise);
    return;
  }
  await promise;
}

/**
 * Отправка многим получателям с учётом лимита Telegram (~30 сообщений в
 * секунду на бота): пачками по 25 с паузой между пачками.
 */
export async function sendInBatches<T>(items: T[], send: (item: T) => Promise<unknown>, batchSize = 25): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.allSettled(items.slice(i, i + batchSize).map(send));
    if (i + batchSize < items.length) await new Promise((r) => setTimeout(r, 1100));
  }
}
