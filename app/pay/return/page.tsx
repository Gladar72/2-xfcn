"use client";

import { useEffect } from "react";

/**
 * Сюда ЮKassa возвращает после оплаты из мобильного приложения (RuStore-версия).
 * Сразу открываем приложение на экране подписки — там статус обновится сам.
 */
const APP_LINK = "mesto://subscription?paid=1";

export default function PayReturnPage() {
  useEffect(() => {
    window.location.replace(APP_LINK);
  }, []);

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
      <img src="/brand/stickers/mosya_party.webp" alt="" width={170} height={170} style={{ objectFit: "contain" }} />
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Спасибо!</h1>
      <p style={{ fontSize: 16, color: "#3D3752", maxWidth: 340, margin: 0, lineHeight: 1.45 }}>
        Возвращаемся в приложение — тариф включится, как только банк подтвердит оплату.
      </p>
      <a
        href={APP_LINK}
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
        Вернуться в приложение
      </a>
    </main>
  );
}
