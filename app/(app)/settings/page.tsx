"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/brand/Logo";
import { useGuide } from "@/lib/mosya/guide";
import { getTelegramWebApp } from "@/lib/telegram/webapp-client";
import { CityPicker } from "@/components/ui/CityPicker";
import { Ic, Screen, Sheet, Toast } from "@/components/proto/ui";
import { SupportSheet } from "@/components/proto/SupportSheet";
import type { IconName } from "@/components/brand/Icon";

interface ProfileSummary {
  name: string;
  city: string;
  morningRemindersEnabled: boolean;
}
interface Sub {
  active: boolean;
  plan?: "start" | "medium" | "premium";
  periodEnd?: string;
}
const PLAN_TITLES = { start: "Старт", medium: "Медиум", premium: "Премьер" } as const;
const SUPPORT_BOT_URL = "https://t.me/Mesto_people_bot";

/** Настройки (SCR.settings прототипа). */
export default function SettingsPage() {
  const router = useRouter();
  const [p, setP] = useState<ProfileSummary | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const [cityOpen, setCityOpen] = useState(false);
  const [supOpen, setSupOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useGuide("settings");

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((d) => !d.error && setP({ name: d.name, city: d.city, morningRemindersEnabled: d.morningRemindersEnabled ?? true }))
      .catch(() => {});
    fetch("/api/subscriptions")
      .then((r) => r.json())
      .then(setSub)
      .catch(() => {});
  }, []);

  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(null), 2400);
  }

  async function toggleMorning() {
    if (!p) return;
    const next = !p.morningRemindersEnabled;
    setP({ ...p, morningRemindersEnabled: next });
    const res = await fetch("/api/me/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ morningRemindersEnabled: next }) }).catch(() => null);
    if (!res?.ok) setP({ ...p, morningRemindersEnabled: !next });
  }

  async function saveCity(city: string) {
    if (!p || city === p.city) return setCityOpen(false);
    const res = await fetch("/api/me/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city }) }).catch(() => null);
    if (res?.ok) {
      setP({ ...p, city });
      setCityOpen(false);
      flash("Город изменён");
    } else flash("Выбери город из списка");
  }

  const Row = ({ i, t, s, href, onClick, ext }: { i: IconName; t: string; s?: string; href?: string; onClick?: () => void; ext?: boolean }) => {
    const body = (
      <>
        <Ic n={i} />
        <span>
          {t}
          {s && <small>{s}</small>}
        </span>
        <Ic n="chev" c="s cv" />
      </>
    );
    if (onClick) return <button onClick={onClick}>{body}</button>;
    if (ext)
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {body}
        </a>
      );
    return <Link href={href ?? "#"}>{body}</Link>;
  };

  return (
    <Screen id="settings" anim="in">
      <div className="bar-top">
        <button className="rb gl" onClick={() => router.back()} aria-label="Назад">
          <Ic n="back" />
        </button>
        <span />
      </div>
      <h1 className="t" style={{ marginTop: 18 }}>
        Настройки
      </h1>

      <span className="lbl">Аккаунт</span>
      <div className="menu gl" style={{ marginTop: 0 }}>
        <Row i="user" t="Профиль" s={p?.name} href="/profile/edit" />
        <Row
          i="gift"
          t="Мой тариф"
          s={sub?.active && sub.plan ? `${PLAN_TITLES[sub.plan]}${sub.periodEnd ? ` · до ${new Date(sub.periodEnd).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}` : ""}` : "без подписки"}
          href="/subscriptions"
        />
        <Row i="bell" t="Уведомления" href="/notifications" />
        <div className="mrow">
          <Ic n="sun" />
          <span>
            Утренние приглашения
            <small>Иногда предлагаем идею на день — не чаще пары раз в неделю</small>
          </span>
          <span className={`sw-t ${p?.morningRemindersEnabled ? "on" : ""}`} role="switch" aria-checked={!!p?.morningRemindersEnabled} onClick={toggleMorning} />
        </div>
        <Row i="pin" t="Город" s={p?.city} onClick={() => setCityOpen(true)} />
        <Row i="lock" t="Приватность и анонимность" href="/settings/privacy" />
      </div>

      <span className="lbl">Помощь</span>
      <div className="menu gl" style={{ marginTop: 0 }}>
        <Row i="help" t="Задать вопрос Мосе" s="ИИ-помощник отвечает сразу" onClick={() => setSupOpen(true)} />
        <Row i="tg" t="Написать в поддержку" s="@Mesto_people_bot" href={SUPPORT_BOT_URL} ext />
      </div>

      <span className="lbl">Документы</span>
      <div className="menu gl" style={{ marginTop: 0 }}>
        <Row i="doc" t="Публичная оферта" href="/legal/offer" />
        <Row i="doc" t="Политика конфиденциальности" href="/legal/privacy" />
      </div>

      <div className="about2">
        <Wordmark height={34} color="#16121F" />
        <span>Когда есть куда пойти, но не с кем.</span>
        <small>Версия 2.0{p?.city ? ` · ${p.city}` : ""}</small>
      </div>
      <button className="btn o" style={{ marginTop: 6 }} onClick={() => getTelegramWebApp()?.close()}>
        Закрыть приложение
      </button>

      <Sheet open={cityOpen} onClose={() => setCityOpen(false)}>
        <h2 className="t">
          Выбери <em>город</em>
        </h2>
        <div className="field gl">
          <CityPicker value={p?.city ?? ""} onChange={saveCity} autoFocus dropdownDirection="up" placeholder="Начни вводить город" className="w-full border-0 bg-transparent text-base outline-none" />
        </div>
      </Sheet>
      <SupportSheet open={supOpen} onClose={() => setSupOpen(false)} />
      <Toast text={toast} />
    </Screen>
  );
}
