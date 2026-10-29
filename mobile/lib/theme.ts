// Дизайн-система «Место» 2026 — те же цвета, шрифт и картинки, что в мини-приложении
// (app/mesto.css, app/proto.css в веб-версии).
import { API_URL } from "./config";

export const colors = {
  violet: "#6C3BFF",
  violet2: "#A24DFF",
  pink: "#FF6FA0",
  peach: "#FFB27A",
  sky: "#5AA9FF",
  tg: "#2AABEE",
  ok: "#22B573",
  live: "#FF3B5C",
  ink: "#16121F",
  ink2: "#3D3752",
  grey: "#8A84A0",
  milk: "#F6F2FF",
  glass: "rgba(255,255,255,0.56)",
  glass2: "rgba(255,255,255,0.76)",
  stroke: "rgba(255,255,255,0.9)",
  lav: "rgba(108,59,255,0.1)",
  danger: "#E5484D",

  // старые имена — чтобы не сломать экраны, которые ещё не перерисованы
  accent: "#6C3BFF",
  accentSoft: "#A24DFF",
  orange: "#FFB27A",
  lavender50: "#F6F2FF",
  lavender100: "#EDE5FF",
  lavender200: "#DCCDFF",
  background: "#F6F2FF",
  surface: "#FFFFFF",
  ink900: "#16121F",
  ink600: "#3D3752",
  ink400: "#8A84A0",
  border: "rgba(108,59,255,0.12)",
  success: "#22B573",
};

/** Фирменный градиент: фиолетовый → сиреневый → розовый (120°). */
export const brandGradient = ["#6C3BFF", "#A24DFF", "#FF6FA0"] as const;
export const gradientStart = { x: 0, y: 0.2 };
export const gradientEnd = { x: 1, y: 0.8 };

export const radius = { card: 24, hero: 32, pill: 999, input: 18 };

/** Шрифт Golos Text — грузится при старте (app/_layout.tsx) из assets/fonts.
 *  Android не умеет брать насыщенность из одного вариативного файла, поэтому
 *  у каждой насыщенности свой статический файл и своё имя семейства. */
export const FONT = "Golos";

export const fonts = {
  "400": FONT,
  "500": "Golos-Medium",
  "600": "Golos-SemiBold",
  "700": "Golos-Bold",
  "800": "Golos-ExtraBold",
  "900": "Golos-Black",
} as const;

export type Weight = keyof typeof fonts;

/** Насыщенность → нужное семейство Golos (вместо fontWeight, который Android игнорирует). */
export function f(weight: Weight = "400") {
  return { fontFamily: fonts[weight] };
}

export const font = {
  display: 32,
  title: 24,
  h2: 19,
  base: 16,
  sm: 14,
  xs: 12.5,
};

/** Текстовые стили: у Golos средняя насыщенность (500) — основная для заголовков. */
export const type = {
  display: { ...f("500"), fontSize: 32, lineHeight: 34, letterSpacing: -0.9, color: colors.ink },
  title: { ...f("500"), fontSize: 24, lineHeight: 27, letterSpacing: -0.6, color: colors.ink },
  h2: { ...f("500"), fontSize: 19, letterSpacing: -0.4, color: colors.ink },
  body: { fontFamily: FONT, fontSize: 15, color: colors.ink },
  small: { fontFamily: FONT, fontSize: 12.5, color: colors.grey },
};

/** Картинки бренда берём с сайта (они там уже есть и кэшируются) — так приложение остаётся лёгким. */
const B = `${API_URL}/brand`;
export const brand = {
  mosya: (pose: "stand" | "wave" | "jump" | "run" | "sit" | "phone" | "think" | "glasses") => `${B}/mosya/mosya_${pose}.webp`,
};

const CAT: Record<string, string> = {
  training: "i_gym",
  cinema: "i_kino",
  coffee: "i_kofe",
  breakfast: "i_zavtrak",
  dinner: "i_uzhin",
  walk: "i_hike",
  active: "i_camp",
  party: "i_party",
  business: "i_biz",
  custom: "i_games",
};
const TRAIN: Record<string, string> = {
  running: "i_run", run: "i_run", gym: "i_gym", yoga: "i_yoga", cycling: "i_bike", bike: "i_bike",
  football: "i_football", tennis: "i_tennis", padel: "i_tennis", swimming: "i_swim", swim: "i_swim",
  boxing: "i_box", martial: "i_box", ski: "i_ski", skiing: "i_ski", roller: "i_roller", hike: "i_hike", hiking: "i_hike",
};

export function catIcon(slug?: string | null): string {
  return `${B}/cat3d/${(slug && CAT[slug]) || "i_art"}.webp`;
}

export function eventIcon(e: { isBusiness?: boolean; category?: { slug: string } | null; trainingType?: { slug: string } | null }): string {
  if (e.isBusiness) return catIcon("business");
  if (e.category?.slug === "training") {
    const t = e.trainingType?.slug;
    return `${B}/cat3d/${(t && (TRAIN[t] ?? TRAIN[t.split(/[-_]/)[0] ?? ""])) || "i_gym"}.webp`;
  }
  return catIcon(e.category?.slug);
}

export const CATEGORY_SHORT: Record<string, string> = {
  training: "Тренировка",
  cinema: "Кино",
  coffee: "Кофе",
  breakfast: "Завтрак",
  dinner: "Ужин",
  walk: "Прогулка",
  active: "Активный отдых",
  party: "Вечеринка",
};

const PINS = ["active", "breakfast", "business", "cinema", "coffee", "custom", "dinner", "party", "training", "walk"];
/** Метка на карте (3D-булавка категории, как в мини-приложении). */
export function pinIcon(e: { isBusiness?: boolean; category?: { slug: string } | null }): string {
  const slug = e.isBusiness ? "business" : e.category?.slug && PINS.includes(e.category.slug) ? e.category.slug : "custom";
  return `${B}/markers/v2/pin-${slug}.png`;
}
