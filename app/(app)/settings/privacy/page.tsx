"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chr, Ic, Screen } from "@/components/proto/ui";

const ANON_DEFAULT_KEY = "mesto_anon_default";

/** «Приватность и анонимность» (SCR.privacy прототипа). */
export default function PrivacyPage() {
  const router = useRouter();
  const [anonDefault, setAnonDefault] = useState(false);
  useEffect(() => {
    try {
      setAnonDefault(localStorage.getItem(ANON_DEFAULT_KEY) === "1");
    } catch {
      /* нет хранилища */
    }
  }, []);
  function toggle() {
    const next = !anonDefault;
    setAnonDefault(next);
    try {
      localStorage.setItem(ANON_DEFAULT_KEY, next ? "1" : "0");
    } catch {
      /* нет хранилища */
    }
  }
  return (
    <Screen id="privacy" anim="in">
      <div className="bar-top">
        <button className="rb gl" onClick={() => router.back()} aria-label="Назад">
          <Ic n="back" />
        </button>
        <span />
      </div>
      <h1 className="t" style={{ marginTop: 18 }}>
        Приватность <em>и анонимность</em>
      </h1>
      <div style={{ display: "grid", gap: 8, marginTop: 18 }}>
        <button className="opt gl" onClick={toggle} role="switch" aria-checked={anonDefault}>
          <div className="d">
            <b>Анонимно по умолчанию</b>
            <span>Все новые встречи будут без твоего профиля — можно поменять при создании</span>
          </div>
          <span className={`sw-t ${anonDefault ? "on" : ""}`} />
        </button>
        <div className="opt gl">
          <div className="d">
            <b>Адрес и организатор анонимной встречи</b>
            <span>Видны только тем, чью заявку ты одобришь</span>
          </div>
          <Ic n="lock" c="s" />
        </div>
        <Link className="opt gl" href="/legal/privacy">
          <div className="d">
            <b>Политика конфиденциальности</b>
            <span>Какие данные храним и зачем</span>
          </div>
          <Ic n="chev" c="s" />
        </Link>
      </div>
      <div className="anonbox gl" style={{ marginTop: 14 }}>
        <Chr shape="ball" pal="lilac" face="hidden" />
        <b>Как выглядит анонимный организатор</b>
        <span>Вместо фото — персонаж, видны только рейтинг и подтверждённый телефон. Профиль откроется участникам после одобрения заявки.</span>
      </div>
    </Screen>
  );
}
