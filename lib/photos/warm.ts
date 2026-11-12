/**
 * Прогрев сжатых копий фото (/_next/image) сразу после загрузки: первый
 * зритель не ждёт, пока сервер скачает оригинал и пережмёт его (это и было
 * «Загружаем фото…» на 2–3 секунды). Ширины и качество — ровно те, что
 * запрашивает интерфейс (lib/photos/thumb.ts): иначе это другой файл кэша.
 */
const LOCAL = `http://127.0.0.1:${process.env.PORT || 3000}`;

export const AVATAR_WIDTHS = [256, 384, 640, 1080];
export const EVENT_WIDTHS = [640, 1200];

export function warmPhoto(url: string | null | undefined, widths: number[]): void {
  if (!url) return;
  for (const w of widths) {
    const u = `${LOCAL}/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=85`;
    void fetch(u, { headers: { Accept: "image/avif,image/webp,*/*" }, signal: AbortSignal.timeout(20_000) })
      .then((r) => r.arrayBuffer())
      .catch(() => {});
  }
}
