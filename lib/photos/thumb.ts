/**
 * Уменьшенная копия фото из Supabase Storage для показа в маленьких
 * кружках/карточках.
 *
 * Фото загружаются до 1600px (~300 КБ), а показываются чаще всего 32–100px.
 * Раньше в каждый кружок аватарки грузился оригинал — при тысячах
 * пользователей онлайн это терабайты трафика из Supabase в месяц.
 * Теперь картинку через встроенный оптимизатор Next.js (/_next/image)
 * уменьшает Vercel и кэширует: Supabase отдаёт оригинал один раз на
 * каждый размер, а пользователь получает лёгкий WebP/AVIF.
 *
 * Работает только для адресов *.supabase.co (они разрешены в
 * next.config.js → images.remotePatterns). Всё остальное (data:-превью
 * при выборе фото, локальные картинки) возвращается как есть.
 */

// Размеры, которые принимает оптимизатор Next.js по умолчанию
// (imageSizes + deviceSizes) — другие ширины он отвергает с ошибкой 400.
const ALLOWED_WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];

const SUPABASE_URL = /^https:\/\/[^/]+\.supabase\.co\//;

/**
 * @param url      исходный адрес фото
 * @param displayPx размер, в котором фото показывается на экране (CSS-пиксели);
 *                  берём запас ×3 под экраны телефонов с высокой плотностью.
 */
export function photoThumb(url: string, displayPx: number): string;
export function photoThumb(url: string | null | undefined, displayPx: number): string | undefined;
export function photoThumb(url: string | null | undefined, displayPx: number): string | undefined {
  if (!url) return undefined;
  if (!SUPABASE_URL.test(url)) return url;
  const target = displayPx * 3;
  const width = ALLOWED_WIDTHS.find((w) => w >= target) ?? 3840;
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=75`;
}
