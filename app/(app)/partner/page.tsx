"use client";

import "./partner.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ic, Screen } from "@/components/proto/ui";
import { getJson } from "@/lib/http/get-json";
import { accountRequest } from "@/lib/http/account-request";
import { goBack } from "@/lib/nav/back";

type Money = Record<string, number>;
interface PartnerInfo {
  status: "none" | "pending" | "approved" | "rejected";
  rate: number;
  link?: string;
  code?: string;
  payoutDetails?: string;
  stats?: { joined: number; registered: number; buyers: number; earned: Money; available: Money; requested: Money; paid: Money };
}
function amount(balances?: Money) {
  return Object.entries(balances ?? {}).filter(([, v]) => v > 0)
    .map(([currency, value]) => value.toLocaleString("ru-RU") + (currency === "XTR" ? " ⭐" : " ₽")).join(" + ") || "0 ₽";
}

export default function PartnerPage() {
  const router = useRouter();
  const [info, setInfo] = useState<PartnerInfo | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    getJson<PartnerInfo>("/api/partner", controller.signal)
      .then(result => { if (controller.signal.aborted) return;
        if (!Number.isFinite(result.rate) || !["none", "pending", "approved", "rejected"].includes(result.status)) {
          throw new Error("Invalid partner response");
        }
        setInfo(result); })
      .catch(() => { if (!controller.signal.aborted) setError("Не удалось загрузить данные партнёра."); });
    return () => controller.abort();
  }, [attempt]);

  async function act(action: "apply" | "save" | "payout") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (action === "payout") {
        const result = await accountRequest<{ amount: string }>("/api/partner/payout", "POST");
        setNotice("Запрошена выплата " + result.amount);
        setInfo(null);
        setAttempt(n => n + 1);
      } else if (action === "save") {
        setInfo(await accountRequest<PartnerInfo>("/api/partner", "PATCH", { payoutDetails: (details ?? "").trim() }));
        setDetails(null);
        setNotice("Реквизиты сохранены");
      } else {
        setInfo(await accountRequest<PartnerInfo>("/api/partner", "POST"));
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Попробуй ещё раз."); }
    finally { setBusy(false); }
  }

  async function share(copy: boolean) {
    if (!info?.link) return;
    try {
      if (!copy && navigator.share) await navigator.share({ title: "МЕСТО", url: info.link });
      else { await navigator.clipboard.writeText(info.link); setNotice("Ссылка скопирована"); }
    } catch (e) { if (!(e instanceof Error && e.name === "AbortError")) setNotice("Скопируй ссылку из поля выше."); }
  }

  const stats = info?.stats;
  const percent = info ? Math.round(info.rate * 100) : 0;
  const perks = [
    ["wallet", percent + "% с каждой оплаты", "Со всех подписок приведённых людей, включая продления, без ограничения по сроку"],
    ["star", "«Премиум» бесплатно", "Все функции приложения без ограничений, пока ты партнёр"],
    ["people", "Новая аудитория", "Тебя увидят люди из города, а твои встречи, тренировки и события — на карте"],
    ["pin", "Навсегда за тобой", "Кто пришёл по твоей ссылке, закрепляется за тобой навсегда"],
  ] as const;
  return <Screen id="partner">
    <button className="rb gl" aria-label="Назад" onClick={() => goBack(router, "/profile")}><Ic n="back" /></button>
    <div className="partner-content">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={'/brand/stickers/' + (info?.status === "approved" ? 'mosya_rich' : 'mosya_pin') + '.webp'} alt="" width={120} height={120} />
      <h1 className="k-h1">Партнёрская <em>программа</em></h1>
      {!info && !error && <p role="status">Загружаем…</p>}
      {error && <div role="alert">{error} <button className="btn o" disabled={busy} onClick={() => setAttempt(n => n + 1)}>Обновить</button></div>}
      {notice && <p role="status">{notice}</p>}
      {info && info.status !== "approved" && <>
        <p>Рекомендуй МЕСТО своей аудитории и получай {percent}% с каждой оплаты подписки приведённых людей.</p>
        {perks.map(([icon, title, description]) => <div key={icon} className="partner-perk k-g">
          <span aria-hidden><Ic n={icon}/></span><div><b>{title}</b><p>{description}</p></div>
        </div>)}
        {info.status === "pending" && <p>Заявка на рассмотрении</p>}
        {info.status === "rejected" && <><p>Заявка отклонена</p><Link className="btn o" href="/support">Написать в поддержку</Link></>}
        {info.status === "none" && <button className="btn v" disabled={busy} onClick={() => act("apply")}>Подать заявку</button>}
      </>}
      {info?.status === "approved" && <>
        <section className="partner-card k-g"><b>Твоя ссылка</b><input className="inp" aria-label="Твоя ссылка" readOnly value={info.link ?? ""} /><p>Код приглашения · {info.code}</p>
          <div className="twob"><button className="btn v" onClick={() => share(false)}>Поделиться</button><button className="btn o" onClick={() => share(true)}>Копировать</button></div></section>
        <section className="partner-card k-g"><b>Статистика</b><p>Перешли · {stats?.joined ?? 0}</p><p>В приложении · {stats?.registered ?? 0}</p><p>Оплатили · {stats?.buyers ?? 0}</p></section>
        <section className="partner-card k-g"><b>Заработано всего · {amount(stats?.earned)}</b>
          <p>Доступно · {amount(stats?.available)}</p><p>Запрошено · {amount(stats?.requested)}</p><p>Выплачено · {amount(stats?.paid)}</p>
          <button className="btn v" disabled={busy || !Object.values(stats?.available ?? {}).some(v => v > 0)}
            onClick={() => info.payoutDetails ? act("payout") : setDetails("")}>Запросить выплату</button>
          {details === null ? <button className="btn o" onClick={() => setDetails(info.payoutDetails ?? "")}>Реквизиты для выплат</button> :
            <form onSubmit={e => { e.preventDefault(); void act("save"); }}>
              <label>Телефон для СБП и банк или номер карты, ФИО получателя<textarea className="inp" value={details} maxLength={500} onChange={e => setDetails(e.target.value)} /></label>
              <button className="btn v" disabled={busy || details.trim().length < 5}>Сохранить</button>
              <button type="button" className="btn o" disabled={busy} onClick={() => setDetails(null)}>Отмена</button>
            </form>}
        </section>
      </>}
    </div>
  </Screen>;
}
