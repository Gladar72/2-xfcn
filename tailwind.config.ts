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
        sans: ["var(--font-golos)", "var(--font-onest)", "system-ui", "sans-serif"],
      },
      colors: {
        // Основной фирменный цвет — purple (был оранжевый accent).
        accent: {
          DEFAULT: "#6C3BFF",
          50: "#F3EEFF",
          100: "#EDE5FF",
          500: "#6C3BFF",
          600: "#5C2FE0",
          700: "#4B25B8",
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
          50: "#F3EEFF",
          100: "#EDE5FF",
          200: "#E5D9FF",
        },
        surface: "#FFFFFF",
        // Основной фон — белый; background используется там, где нужен лёгкий lavender-оттенок.
        background: "#F6F2FF",
        ink: {
          900: "#16121F",
          700: "#3D3752",
          600: "#6E6982",
          400: "#8A84A0",
        },
      },
      backgroundImage: {
        // Основной фирменный градиент МЕСТО — для CTA, selected states, "Своё предложение".
        "brand-gradient": "linear-gradient(120deg, #6C3BFF 0%, #A24DFF 48%, #FF6FA0 100%)",
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
        card: "inset 0 0 0 1px rgba(255,255,255,.9), 0 10px 26px -20px rgba(80,40,170,.45)",
        "card-lg": "inset 0 0 0 1px rgba(255,255,255,.9), 0 22px 40px -24px rgba(90,40,180,.55)",
        cta: "0 14px 30px -14px rgba(130,60,255,.9)",
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
