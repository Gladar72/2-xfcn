"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { TelegramLoginWidget } from "@/components/telegram/TelegramLoginWidget";
import { readLaunchData } from "@/lib/telegram/launch-data";

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
    if (readLaunchData(window.location.hash, window.location.search)) {
      window.location.replace(`/app${window.location.search}${window.location.hash}`);
      return;
    }
    fetch("/api/auth/web/session")
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) window.location.replace(target());
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleTelegramAuth(user: Record<string, string | number>) {
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
  }

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
    <main className="K" style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#17141F", color: "#fff", fontFamily: "var(--disp)" }}>
      <div className="k-abg" aria-hidden style={{ backgroundImage: "url(/brand/auth/auth_bg.webp)" }} />
      <div className="k-ashade" aria-hidden />
      <div className="k-alogo" style={{ top: "34%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/auth/wordmark-white.svg" alt="место" />
        <p>
          Найди <em>компанию</em>
          <br />
          на сегодня
        </p>
      </div>
      <div className="k-abtns" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)", maxWidth: 440, margin: "0 auto" }}>
        <small>Через Telegram быстрее всего — имя и фото подтянутся сами</small>
        {EMAIL_LOGIN && (
          <div style={{ marginBottom: 14 }}>
            {step === "email" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (emailOk && !busy) sendCode();
                }}
              >
                <input type="email" inputMode="email" autoComplete="email" placeholder="Твоя почта" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
                <button type="submit" className="k-btn k-d" disabled={!emailOk || busy} style={{ marginTop: 10, opacity: !emailOk || busy ? 0.55 : 1 }}>
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
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 14 }}>
                  <button type="button" onClick={() => setStep("email")} style={linkStyle}>
                    Другая почта
                  </button>
                  <button type="button" disabled={resendIn > 0 || busy} onClick={sendCode} style={{ ...linkStyle, opacity: resendIn > 0 ? 0.5 : 1 }}>
                    {resendIn > 0 ? `Снова через ${resendIn} с` : "Отправить снова"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <TelegramLoginWidget onAuth={handleTelegramAuth} brand />
        {error && <p style={{ color: "#C2413A", fontSize: 14, margin: "12px 0 0", textAlign: "center" }}>{error}</p>}
        <p className="k-alegal">
          Продолжая, вы принимаете <a href="/legal/offer">оферту</a> и <a href="/legal/privacy">политику конфиденциальности</a>
        </p>
      </div>
    </main>
  );
}

// Вход по почте (и Google/Apple) включим вместе с выходом в App Store и RuStore.
const EMAIL_LOGIN = false;

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 54,
  borderRadius: 18,
  border: "1px solid rgba(23,20,31,.1)",
  background: "rgba(255,255,255,.8)",
  padding: "0 16px",
  fontSize: 17,
  outline: "none",
  color: "#16121F",
  boxSizing: "border-box",
};
const linkStyle: React.CSSProperties = { background: "none", border: 0, color: "#17141F", padding: 0, cursor: "pointer", fontSize: 14 };
