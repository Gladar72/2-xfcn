import type { Metadata } from "next";

/**
 * Партнёрская ссылка: mesto-go.ru/r/<code>.
 * Открывает приложение (mesto://r/<code> — код применится при регистрации)
 * или Telegram-бота (t.me/<bot>?start=ref_<code>), пока приложения нет в магазинах.
 */
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "Mesto_people_bot";

export const metadata: Metadata = {
  title: "Тебя зовут в МЕСТО",
  description: "Находи компанию на кофе, тренировку, кино и прогулки",
};

export default async function ReferralPage({ params }: { params: Promise<{ code: string }> | { code: string } }) {
  const { code: raw } = await params;
  const code = /^[a-z0-9]{4,32}$/i.test(raw) ? raw.toLowerCase() : "";
  const appLink = code ? `mesto://r/${code}` : "mesto://";
  const tgLink = `https://t.me/${BOT_USERNAME}${code ? `?start=ref_${code}` : ""}`;
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "32px 20px",
        textAlign: "center",
        background: "radial-gradient(120% 80% at 50% 0%, #EDE5FF 0%, #F6F2FF 60%)",
        fontFamily: "var(--font-golos), system-ui, sans-serif",
        color: "#16121F",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/stickers/mosya_wave.webp" alt="" width={180} height={180} style={{ objectFit: "contain" }} />
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Тебя зовут в МЕСТО</h1>
      <p style={{ fontSize: 16, color: "#3D3752", maxWidth: 360, margin: 0, lineHeight: 1.45 }}>
        Находи компанию на кофе, тренировку, кино и прогулки. Сначала активность — потом человек.
      </p>
      <a
        href={appLink}
        style={{
          marginTop: 10,
          width: "100%",
          maxWidth: 340,
          padding: "15px 20px",
          borderRadius: 18,
          background: "linear-gradient(120deg, #6C3BFF, #A24DFF 55%, #FF6FA0)",
          color: "#fff",
          fontWeight: 600,
          fontSize: 16,
          textDecoration: "none",
        }}
      >
        Открыть в приложении
      </a>
      <a
        href={tgLink}
        style={{
          width: "100%",
          maxWidth: 340,
          padding: "15px 20px",
          borderRadius: 18,
          background: "#2AABEE",
          color: "#fff",
          fontWeight: 600,
          fontSize: 16,
          textDecoration: "none",
        }}
      >
        Открыть в Telegram
      </a>
      {code ? (
        <p style={{ fontSize: 13, color: "#8A84A0", marginTop: 6 }}>
          Код приглашения: <b style={{ color: "#6C3BFF", letterSpacing: 1 }}>{code}</b> — его можно ввести в приложении в настройках
        </p>
      ) : null}
    </main>
  );
}
