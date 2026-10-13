import { API_URL } from "./config";

/**
 * Стикеры чата. В сообщении хранится служебный текст [[sticker:<slug>]]
 * (см. lib/chat/invite.ts на сервере), картинка берётся с сайта.
 *
 * Мося — анимированные WebP с прозрачностью (public/brand/stickers/*.webp),
 * интересы — статичные 3D-иконки (public/brand/cat3d/i_*.webp).
 */

export interface Sticker {
  slug: string;
  label: string;
}

/** Анимированные Моси: порядок = порядок в панели. */
export const MOSYA_STICKERS: Sticker[] = [
  { slug: "mosya_wave", label: "Привет!" },
  { slug: "mosya_stand", label: "Я на месте" },
  { slug: "mosya_run", label: "Бегу!" },
  { slug: "mosya_late", label: "Опаздываю" },
  { slug: "mosya_coffee", label: "На кофе?" },
  { slug: "mosya_jump", label: "Ура!" },
  { slug: "mosya_lol", label: "Ха-ха" },
  { slug: "mosya_love", label: "Люблю" },
  { slug: "mosya_shy", label: "Стесняюсь" },
  { slug: "mosya_clap", label: "Браво" },
  { slug: "mosya_wow", label: "Ого!" },
  { slug: "mosya_think", label: "Хм…" },
  { slug: "mosya_facepalm", label: "Ну как так" },
  { slug: "mosya_sad", label: "Грущу" },
  { slug: "mosya_angry", label: "Злюсь" },
  { slug: "mosya_cool", label: "Крутой" },
  { slug: "mosya_glasses", label: "Умник" },
  { slug: "mosya_phone", label: "На связи" },
  { slug: "mosya_selfie", label: "Селфи" },
  { slug: "mosya_sit", label: "Жду" },
  { slug: "mosya_sleep", label: "Сплю" },
  { slug: "mosya_party", label: "Праздник" },
  { slug: "mosya_bday", label: "С днём рождения" },
  { slug: "mosya_gift", label: "Подарок" },
  { slug: "mosya_music", label: "Кайфую" },
  { slug: "mosya_gym", label: "Качаюсь" },
  { slug: "mosya_sport", label: "Спорт" },
  { slug: "mosya_travel", label: "В путь" },
  { slug: "mosya_winter", label: "Холодно" },
  { slug: "mosya_rich", label: "Богач" },
  { slug: "mosya_gold", label: "Король" },
  { slug: "mosya_pin", label: "Наше место" },
];

const INTERESTS = [
  "kofe", "zavtrak", "uzhin", "pizza", "bar", "party", "karaoke", "concert", "music", "guitar",
  "kino", "theatre", "art", "photo", "books", "lang", "games", "biz", "cook", "banya",
  "run", "gym", "yoga", "bike", "football", "tennis", "swim", "box", "ski", "roller",
  "hike", "camp", "trip", "travel", "world", "dogs",
];
export const INTEREST_STICKERS: Sticker[] = INTERESTS.map((s) => ({ slug: `i_${s}`, label: "" }));

const LABELS = new Map(MOSYA_STICKERS.map((s) => [s.slug, s.label]));

export function stickerUrl(slug: string): string {
  if (slug.startsWith("i_")) return `${API_URL}/brand/cat3d/${slug}.webp`;
  return `${API_URL}/brand/stickers/${slug}.webp`;
}

export function stickerLabel(slug: string): string {
  return LABELS.get(slug) ?? "Стикер";
}

export function stickerContent(slug: string): string {
  return `[[sticker:${slug}]]`;
}

const STICKER_RE = /^\[\[sticker:([a-z0-9_]{1,40})\]\]$/;
export function parseSticker(content: string | null | undefined): string | null {
  return content?.trim().match(STICKER_RE)?.[1] ?? null;
}

const INVITE_RE = /^\[\[invite:([0-9a-f-]{36})\]\]$/;
export function parseInvite(content: string | null | undefined): string | null {
  return content?.trim().match(INVITE_RE)?.[1] ?? null;
}

/**
 * Реакции на сообщения: 6 быстрых, все — анимированные Моси.
 * В БД хранится slug (поле emoji до 32 символов).
 */
export const REACTIONS: Sticker[] = [
  { slug: "mosya_love", label: "Люблю" },
  { slug: "mosya_lol", label: "Ха-ха" },
  { slug: "mosya_clap", label: "Браво" },
  { slug: "mosya_wow", label: "Ого!" },
  { slug: "mosya_sad", label: "Грущу" },
  { slug: "mosya_angry", label: "Злюсь" },
];
