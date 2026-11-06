import type { Config } from "tailwindcss";

/**
 * Дизайн-токены МЕСТО (ребрендинг, см. MESTO_FINAL_assets).
 *
 * ВАЖНО: имена токенов (accent, ink, background, card, pill...) оставлены
 * ТЕМИ ЖЕ, что были раньше — меняются только значения. Это значит весь
 * редизайн применяется автоматически по всему приложению без необходимости
 * переписывать className в каждом компоненте. Новые токены (lavender,
 * orange, brand-gradient, shadow.cta/soft) добавлены для новых элементов.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "-apple-system", "sans-serif"],
        accent: ["var(--font-lora)", "Lora", "Georgia", "serif"],
      },
      colors: {
        // Основной фирменный цвет — purple (был оранжевый accent).
        // Брендбук 2026: основной цвет действий — графит (ink), подложки — жемчуг.
        accent: {
          DEFAULT: "#17141F",
          50: "#F4F2F8",
          100: "#ECE8F2",
          500: "#17141F",
          600: "#2A2536",
          700: "#000000",
        },
        // Второй фирменный цвет — orange, используется в градиенте и как тёплый акцент.
        // Редизайн 2026: тёплый акцент — розовый (ротик Моси, конец градиента).
        // Имя токена "orange" оставлено, чтобы не переписывать className.
        orange: {
          DEFAULT: "#FF6FA0",
          400: "#FF86B0",
          500: "#FF6FA0",
          600: "#FF9DBF",
        },
        pink: { DEFAULT: "#FF6FA0", 500: "#FF6FA0" },
        sky: { DEFAULT: "#5AA9FF" },
        peach: { DEFAULT: "#FFB27A" },
        tg: { DEFAULT: "#2AABEE" },
        // Lavender — светлые "фирменные" подложки (selected state, карточки).
        lavender: {
          50: "#F4F2F8",
          100: "#ECE8F2",
          200: "#E2DDEA",
        },
        surface: "#FFFFFF",
        // Основной фон — белый; background используется там, где нужен лёгкий lavender-оттенок.
        background: "#F4F2F8",
        ink: {
          900: "#17141F",
          700: "#3A3646",
          600: "#6B6875",
          400: "#8E8B96",
        },
      },
      backgroundImage: {
        // Основной фирменный градиент МЕСТО — для CTA, selected states, "Своё предложение".
        "brand-gradient": "linear-gradient(120deg, #17141F 0%, #2A2536 100%)",
      },
      borderRadius: {
        card: "24px",
        "card-lg": "32px",
        "card-sm": "18px",
        pill: "999px",
        sheet: "32px",
      },
      // Единая шкала шрифтов всего приложения (по запросу — «везде одинаково»):
      // display 28 — заголовок экрана, title 20 — заголовок блока,
      // base 16 — поля ввода и строки меню, sm 14 — основной текст,
      // xs 12 — вторичный текст, caption 11 — бейджи, счётчики, время.
      // Произвольные размеры вроде text-[13px] больше не используются.
      fontSize: {
        caption: ["11px", { lineHeight: "14px" }],
        display: ["28px", { lineHeight: "34px", fontWeight: "800" }],
        title: ["20px", { lineHeight: "26px", fontWeight: "700" }],
      },
      // Стеклянные карточки редизайна: тонкий белый контур + мягкая фиолетовая тень.
      boxShadow: {
        card: "inset 0 0 0 1px rgba(255,255,255,.95), 0 10px 26px -20px rgba(60,40,120,.28)",
        "card-lg": "inset 0 0 0 1px rgba(255,255,255,.95), 0 22px 40px -24px rgba(60,40,120,.32)",
        cta: "0 14px 30px -16px rgba(23,20,31,.45)",
      },
      transitionTimingFunction: {
        mesto: "cubic-bezier(.32,.72,0,1)",
        spring: "cubic-bezier(.34,1.56,.64,1)",
      },
    },
  },
  plugins: [],
};

export default config;
