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
        sans: ["var(--font-onest)", "Manrope", "system-ui", "sans-serif"],
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
        orange: {
          DEFAULT: "#FF8A2A",
          400: "#FF9A3D",
          500: "#FF8A2A",
          600: "#FFA94D",
        },
        // Lavender — светлые "фирменные" подложки (selected state, карточки).
        lavender: {
          50: "#F3EEFF",
          100: "#EDE5FF",
          200: "#E5D9FF",
        },
        surface: "#FFFFFF",
        // Основной фон — белый; background используется там, где нужен лёгкий lavender-оттенок.
        background: "#FCFAFF",
        ink: {
          900: "#111111",
          600: "#686868",
          400: "#8B8B8B",
        },
      },
      backgroundImage: {
        // Основной фирменный градиент МЕСТО — для CTA, selected states, "Своё предложение".
        "brand-gradient": "linear-gradient(135deg, #6C3BFF 0%, #8A5CFF 45%, #FF8A2A 100%)",
      },
      borderRadius: {
        card: "24px",
        "card-lg": "32px",
        "card-sm": "18px",
        pill: "999px",
        sheet: "32px",
      },
      fontSize: {
        display: ["28px", { lineHeight: "34px", fontWeight: "800" }],
        title: ["20px", { lineHeight: "26px", fontWeight: "700" }],
      },
      boxShadow: {
        card: "0 6px 20px rgba(110, 70, 180, 0.08)",
        "card-lg": "0 8px 30px rgba(90, 65, 150, 0.10)",
        cta: "0 10px 28px rgba(108, 59, 255, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
