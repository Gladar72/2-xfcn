import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Единственный акцентный цвет продукта. Меняется в одном месте.
        accent: {
          DEFAULT: "#FF5A36",
          50: "#FFF3EF",
          100: "#FFE3D9",
          500: "#FF5A36",
          600: "#E8451F",
          700: "#C23815",
        },
        surface: "#FFFFFF",
        background: "#FAFAF9",
        ink: {
          900: "#14141A",
          600: "#5B5B66",
          400: "#9A9AA5",
        },
      },
      borderRadius: {
        card: "20px",
        pill: "999px",
      },
      fontSize: {
        "display": ["28px", { lineHeight: "34px", fontWeight: "700" }],
        "title": ["20px", { lineHeight: "26px", fontWeight: "600" }],
      },
      boxShadow: {
        card: "0 2px 12px rgba(20, 20, 26, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
