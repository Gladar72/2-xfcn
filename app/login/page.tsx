"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Wordmark } from "@/components/brand/Logo";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "Mesto_people_bot";

/**
 * Вход на сайте без мини-приложения: по почте (код из письма) или через Telegram
 * (виджет Telegram Login — тот же профиль, что в мини-приложении, по telegram_id).
 * Те же эндпоинты, что у мобильного приложения: /api/auth/mobile/email/send|verify.
 * Новый человек получает ticket и идёт на /onboarding (анкета та же, что в мини-приложении).
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

const VIOLET = "#6C3BFF";

function LoginInner() {
  const params = useSearchParams();
  const goto = params.get("goto");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const tgBox = useRef<HTMLDivElement>(null);

  const target = () => {
    const ev = goto?.match(/^event(share)?_([0-9a-f-]{36})$/);
    const chat = goto?.match(/^chat_([0-9a-f-]{36})$/);
    if (ev) return `/events/${ev[2]}${ev[1] ? "?share=1" : ""}`;
    if (chat) return `/chats/${chat[1]}`;
    if (goto === "subscriptions") return "/subscriptions";
    return "/feed";
  };

  // Уже вошёл в этом браузере — сразу в приложение.
  useEffect(() => {
    fetch("/api/auth/web/session")
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) window.location.replace(target());
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Кнопка «Войти через Telegram» — для тех, кто уже пользовался мини-приложением.
  useEffect(() => {
    (window as unknown as { onTelegramAuth: (u: Record<string, string | number>) => void }).onTelegramAuth = async (user) => {
      setError(null);
      setBusy(true);
      try {
        const res = await fetch("/api/auth/mobile/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authData: user }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(d.error === "user_banned" ? "Профиль заблокирован" : d.message ?? "Не удалось войти через Telegram");
          return;
        }
        await finish(d);
      } catch {
        setError("Нет связи. Проверь интернет");
      } finally {
        setBusy(false);
      }
    };
    const box = tgBox.current;
    if (!box || box.childElementCount > 0) return;
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", BOT_USERNAME);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "14");
    s.setAttribute("data-request-access", "write");
    s.setAttribute("data-onauth", "onTelegramAuth(user)");
    box.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Ответ verify/telegram: вошёл — кладём сессию в cookie; новый — на анкету с «пропуском». */
  async function finish(d: { status?: string; token?: string; ticket?: string }) {
    if (d.status === "authenticated" && d.token) {
      const s = await fetch("/api/auth/web/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: d.token }),
      });
      if (!s.ok) throw new Error("session");
      window.location.replace(target());
      return;
    }
    if (d.status === "needs_registration" && d.ticket) {
      try {
        sessionStorage.setItem("mesto_reg_ticket", d.ticket);
        const after = target();
        if (after !== "/feed") sessionStorage.setItem("mesto_after_onboarding", after);
      } catch {
        setError("Браузер не даёт сохранить данные. Выключи приватный режим и попробуй снова");
        return;
      }
      window.location.replace("/onboarding");
      return;
    }
    setError("Что-то пошло не так. Попробуй ещё раз");
  }

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/mobile/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.message ?? "Не получилось отправить код. Попробуй ещё раз");
        if (d.retryAfter) setResendIn(d.retryAfter);
        return;
      }
      setStep("code");
      setCode("");
      setResendIn(d.resendIn ?? 60);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch {
      setError("Нет связи. Проверь интернет");
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/mobile/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: value }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error === "user_banned" ? "Профиль заблокирован" : d.message ?? "Код не подошёл");
        setCode("");
        return;
      }
      await finish(d);
    } catch {
      setError("Нет связи. Проверь интернет");
    } finally {
      setBusy(false);
    }
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        background: "linear-gradient(180deg,#EADBFC 0%,#F6F2FF 45%,#FFE6D8 100%)",
        color: "#16121F",
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <Wordmark height={40} color="#16121F" />
        </div>
        <h1 style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 600, letterSpacing: -0.8, textAlign: "center", margin: 0 }}>
          Есть куда пойти.
          <br />
          Найдём, <span style={{ color: VIOLET }}>с кем</span>
        </h1>
        <p style={{ textAlign: "center", color: "#3D3752", fontSize: 15, margin: "10px 0 28px" }}>
          {step === "email" ? "Войди по почте — пришлём код из 4 цифр" : `Код отправили на ${email}`}
        </p>

        <div style={{ background: "rgba(255,255,255,.8)", borderRadius: 28, padding: 20, boxShadow: "0 10px 30px rgba(108,59,255,.10)" }}>
          {step === "email" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (emailOk && !busy) sendCode();
              }}
            >
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="Твоя почта"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
              <button type="submit" disabled={!emailOk || busy} style={{ ...btnStyle, opacity: !emailOk || busy ? 0.55 : 1 }}>
                {busy ? "Отправляем…" : "Получить код"}
              </button>
            </form>
          ) : (
            <div>
              <input
                ref={codeRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="• • • •"
                maxLength={4}
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setCode(v);
                  if (v.length === 4 && !busy) verify(v);
                }}
                style={{ ...inputStyle, textAlign: "center", fontSize: 28, letterSpacing: 12 }}
              />
              <button type="button" disabled={code.length !== 4 || busy} onClick={() => verify(code)} style={{ ...btnStyle, opacity: code.length !== 4 || busy ? 0.55 : 1 }}>
                {busy ? "Проверяем…" : "Войти"}
              </button>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 14 }}>
                <button type="button" onClick={() => setStep("email")} style={linkStyle}>
                  Другая почта
                </button>
                <button type="button" disabled={resendIn > 0 || busy} onClick={sendCode} style={{ ...linkStyle, opacity: resendIn > 0 ? 0.5 : 1 }}>
                  {resendIn > 0 ? `Отправить снова через ${resendIn} с` : "Отправить снова"}
                </button>
              </div>
            </div>
          )}
          {error && <p style={{ color: "#E5484D", fontSize: 14, margin: "12px 0 0", textAlign: "center" }}>{error}</p>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0 14px", color: "#8A84A0", fontSize: 13 }}>
          <span style={{ flex: 1, height: 1, background: "rgba(108,59,255,.15)" }} />
          или
          <span style={{ flex: 1, height: 1, background: "rgba(108,59,255,.15)" }} />
        </div>
        <div ref={tgBox} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} />
        <p style={{ textAlign: "center", fontSize: 13, color: "#8A84A0", marginTop: 12, lineHeight: 1.4 }}>
          Уже пользуешься «Местом» в Telegram? Входи через Telegram — профиль, встречи и чаты сохранятся.
        </p>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 54,
  borderRadius: 18,
  border: "1px solid rgba(108,59,255,.18)",
  background: "#fff",
  padding: "0 16px",
  fontSize: 17,
  outline: "none",
  color: "#16121F",
  boxSizing: "border-box",
};
const btnStyle: React.CSSProperties = {
  width: "100%",
  height: 54,
  marginTop: 12,
  border: 0,
  borderRadius: 999,
  background: "linear-gradient(100deg,#6C3BFF,#A24DFF 60%,#FF6FA0)",
  color: "#fff",
  fontSize: 17,
  fontWeight: 600,
  cursor: "pointer",
};
const linkStyle: React.CSSProperties = { background: "none", border: 0, color: VIOLET, padding: 0, cursor: "pointer", fontSize: 14 };
