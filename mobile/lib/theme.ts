// Дизайн-система «Место» 2026 — те же цвета, шрифт и картинки, что в мини-приложении
// (app/mesto.css, app/proto.css в веб-версии).
import { API_URL } from "./config";

export const colors = {
  // Палитра прототипа 2026: чернила, перламутр, сирень, небо, персик, зелёный «ок». Розового нет.
  violet: "#17141F", // бывший фиолетовый акцент — теперь чернила (кнопки, ссылки, активные элементы)
  violet2: "#3F3A4E",
  pink: "#AAA0FF", // бывший розовый — сирень
  lilac: "#AAA0FF",
  peach: "#FFBEA0",
  sky: "#8CAAFF",
  tg: "#2AABEE",
  ok: "#2FA86A",
  live: "#2FA86A", // «Идёт сейчас» — зелёная точка
  ink: "#17141F",
  ink2: "#3F3A4E",
  grey: "#7C7787",
  milk: "#F4F2F8", // перламутр
  pearl: "#F4F2F8",
  pearl2: "#ECE8F2",
  glass: "rgba(255,255,255,0.62)",
  glass2: "rgba(255,255,255,0.86)",
  stroke: "rgba(255,255,255,0.9)",
  lav: "rgba(23,20,31,0.06)",
  danger: "#E5484D",

  // старые имена — чтобы не сломать экраны
  accent: "#17141F",
  accentSoft: "#3F3A4E",
  orange: "#FFBEA0",
  lavender50: "#F4F2F8",
  lavender100: "#ECE8F2",
  lavender200: "#DCD5FF",
  background: "#F4F2F8",
  surface: "#FFFFFF",
  ink900: "#17141F",
  ink600: "#3F3A4E",
  ink400: "#7C7787",
  border: "rgba(23,20,31,0.08)",
  success: "#2FA86A",
};

/** Бывший фирменный градиент → чернила (в прототипе акцент — Lora Italic, без цветных градиентов). */
export const brandGradient = ["#17141F", "#2A2636", "#3F3A4E"] as const;
export const gradientStart = { x: 0, y: 0.2 };
export const gradientEnd = { x: 1, y: 0.8 };

export const radius = { card: 24, hero: 32, pill: 999, input: 18 };

/** Шрифты прототипа: Inter (Light — заголовки) и Lora Italic — одно слово-акцент.
 *  На Android у каждой насыщенности свой файл и своё имя семейства. */
export const FONT = "Inter-Regular";
export const SERIF = "Lora-Italic";

export const fonts = {
  "300": "Inter-Light",
  "400": "Inter-Regular",
  "500": "Inter-Medium",
  "600": "Inter-SemiBold",
  "700": "Inter-SemiBold",
  "800": "Inter-SemiBold",
  "900": "Inter-SemiBold",
} as const;

export type Weight = keyof typeof fonts;

/** Насыщенность → нужное семейство (вместо fontWeight, который Android игнорирует). */
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

/** Текстовые стили: заголовки — Inter Light, как в прототипе. */
export const type = {
  display: { ...f("300"), fontSize: 34, lineHeight: 37, letterSpacing: -1.1, color: colors.ink },
  title: { ...f("300"), fontSize: 26, lineHeight: 29, letterSpacing: -0.7, color: colors.ink },
  h2: { ...f("500"), fontSize: 19, letterSpacing: -0.4, color: colors.ink },
  body: { fontFamily: FONT, fontSize: 15, color: colors.ink },
  small: { fontFamily: FONT, fontSize: 12.5, color: colors.grey },
};

/** Картинки бренда берём с сайта (они там уже есть и кэшируются) — так приложение остаётся лёгким. */
const B = `${API_URL}/brand`;
export const brand = {
  // Мося прототипа — перламутровая капля с глазами (кадры шейдера); у каждой «позы» своя форма капли.
  mosya: (pose: "stand" | "wave" | "jump" | "run" | "sit" | "phone" | "think" | "glasses") =>
    `${B}/creature/me${{ stand: "00", wave: "04", jump: "08", run: "12", sit: "16", phone: "20", think: "06", glasses: "10" }[pose]}.webp`,
};

// Иконки прототипа (тёмные силуэты, одна идея — одна иконка): public/brand/pi/*.svg на сайте.
const CAT: Record<string, string> = {
  training: "training",
  cinema: "kino",
  coffee: "kofe",
  breakfast: "zavtrak",
  dinner: "uzhin",
  walk: "walk",
  active: "camp",
  party: "party",
  business: "biz",
  custom: "other",
};
const TRAIN: Record<string, string> = {
  running: "run", run: "run", gym: "gym", yoga: "yoga", cycling: "bike", bike: "bike",
  football: "football", tennis: "tennis", padel: "padel", swimming: "swim", swim: "swim",
  boxing: "box", martial: "box", ski: "ski", skiing: "ski", roller: "roller", hike: "hike", hiking: "hike", hyrox: "hyrox",
};

export function catIcon(slug?: string | null): string {
  return `${B}/pi/${(slug && CAT[slug]) || "other"}.svg`;
}

export function eventIcon(e: { isBusiness?: boolean; category?: { slug: string } | null; trainingType?: { slug: string } | null }): string {
  if (e.isBusiness) return catIcon("business");
  if (e.category?.slug === "training") {
    const t = e.trainingType?.slug;
    return `${B}/pi/${(t && (TRAIN[t] ?? TRAIN[t.split(/[-_]/)[0] ?? ""])) || "training"}.svg`;
  }
  return catIcon(e.category?.slug);
}

/** Старое имя 3D-иконки (i_kofe, kofe…) → иконка прототипа (как lib/data/interests.ts на сайте). */
const PI: Record<string, string> = { kofe: "kofe", zavtrak: "zavtraki", uzhin: "uzhiny", bar: "bars", pizza: "street", party: "parties", games: "games", cook: "cook", dogs: "dogs", biz: "network", banya: "banya", lang: "lang", run: "run", gym: "sportzal", yoga: "yoga", bike: "bike", hike: "hike", camp: "camp", ski: "ski", swim: "swim", football: "football", tennis: "tennis", box: "box", roller: "roller", travel: "travel", trip: "travel", world: "excursion", photo: "photo", kino: "kino", theatre: "theatre", music: "music", karaoke: "karaoke", guitar: "jam", art: "expo", books: "books", concert: "concert" };
export function piIcon(name: string): string {
  const n = name.replace(/^i_/, "");
  return `${B}/pi/${PI[n] ?? "other"}.svg`;
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
