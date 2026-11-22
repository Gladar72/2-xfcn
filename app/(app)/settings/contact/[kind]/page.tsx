"use client";

import { useState, type FormEvent } from "react";
import { notFound, useRouter } from "next/navigation";
import { Ic, Screen } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";
import { accountRequest } from "@/lib/http/account-request";

export default function AccountContact({ params }: { params: { kind: string } }) {
  const { kind } = params;
  const router = useRouter();
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!["email", "phone", "referral"].includes(kind)) notFound();
  const referral = kind === "referral";
  const email = kind === "email";
  const label = referral ? "Код приглашения" : email ? "Почта" : "Телефон";
  const title = referral ? label : label + " для входа";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (referral) {
        await accountRequest("/api/me/referral", "POST", { code: value.trim().toLowerCase() });
        router.replace("/settings");
      } else if (sent) {
        await accountRequest("/api/me/" + kind, "POST", { [kind]: value.trim(), code });
        router.replace("/settings");
      } else {
        await accountRequest("/api/auth/mobile/" + kind + "/send", "POST", { [kind]: value.trim() });
        setSent(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Проверь соединение и попробуй ещё раз.");
    } finally { setBusy(false); }
  }

  return <Screen id="account-contact">
    <button className="rb gl" aria-label="Назад" onClick={() => goBack(router, "/settings")}><Ic n="back" /></button>
    <h1 className="t">{title}</h1>
    <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 16 }}>
      <p>{referral ? "Введи код партнёра в первые 30 дней после регистрации." : sent ? "Код отправлен на " + value : "Привяжи " + (email ? "почту" : "телефон") + ", чтобы входить в тот же профиль по коду."}</p>
      {sent ? <label>Код из {email ? "письма" : "SMS"}
        <input className="inp" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{4}" value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))} />
      </label> : <label>{label}
        <input className="inp" type={referral ? "text" : email ? "email" : "tel"} required value={value}
          autoComplete={referral ? "off" : email ? "email" : "tel"} onChange={e => setValue(e.target.value)}
          minLength={referral ? 4 : undefined} maxLength={referral ? 32 : undefined} />
      </label>}
      {error && <p role="alert">{error}</p>}
      <button className="btn v" disabled={busy}>{busy ? "Подожди…" : referral ? "Применить" : sent ? "Подтвердить" : "Получить код"}</button>
      {sent && <button type="button" className="btn o" disabled={busy} onClick={() => { setSent(false); setCode(""); setError(""); }}>Изменить {email ? "почту" : "номер"}</button>}
    </form>
  </Screen>;
}
