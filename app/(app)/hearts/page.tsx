"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen } from "@/components/proto/ui";
import { KI, bg } from "@/components/proto/k";
import { Creature } from "@/components/brand/Creature";
import { goBack } from "@/lib/nav/back";
import { heartTime, incomingHearts, type IncomingHeart } from "@/lib/people/heart-inbox";
import "./hearts.css";

export default function HeartsPage() {
  const router = useRouter();
  const [people, setPeople] = useState<IncomingHeart[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [onlyNew, setOnlyNew] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    incomingHearts(controller.signal).then(items => {
      if (controller.signal.aborted) return;
      setPeople(items);
      setStatus("ready");
    }).catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, [attempt]);

  const unread = people.filter(person => person.unread);
  const shown = onlyNew ? unread : people;
  const rows: IncomingHeart[][] = [];
  for (let i = 0; i < shown.length; i += 3) rows.push(shown.slice(i, i + 3));
  return <Screen id="hearts" anim="in">
    <button className="rb gl" aria-label="Назад" onClick={() => goBack(router, "/profile")}><KI n="back" /></button>
    <h1 className="k-h1">Тебе поставили<br/><em>сердечко</em></h1>
    <div className="k-seg2 k-g" aria-label="Входящие сердечки">
      {[false, true].map(fresh => <button key={String(fresh)} aria-pressed={onlyNew === fresh}
        className={onlyNew === fresh ? "k-on" : ""} onClick={() => setOnlyNew(fresh)}>
        {fresh ? "Новые" : "Все"} · {status === "ready" ? (fresh ? unread : people).length : "…"}
      </button>)}
    </div>
    {status === "loading" && <p role="status" className="empty">Загружаем сердечки…</p>}
    {status === "error" && <div className="empty" role="alert">Не удалось загрузить сердечки
      <button className="btn o" onClick={() => setAttempt(n => n + 1)}>Повторить</button></div>}
    {status === "ready" && shown.length === 0 && <div className="empty"><Creature size={92}/>
      <b>{onlyNew ? "Все сердечки просмотрены" : "Пока нет сердечек"}</b>
      <span>{onlyNew ? "Профили остались во вкладке «Все»." : "Здесь появятся люди, которым ты понравился."}</span>
    </div>}
    {rows.map(row => <div key={row[0]!.id} className="hearts-mosaic">
      {row.map(person => <Link key={person.id} href={`/people/${person.id}?heart=1`} prefetch={false}
        className="k-mt k-pr" style={bg(person.avatarUrl, 640, "center 30%")}>
        {person.unread && <span className="k-cm k-gw">♥ Новое</span>}
        <span className="k-mb"><b>{person.name}{person.age ? `, ${person.age}` : ""}</b>
          <small>{heartTime(person.createdAt)}</small></span>
      </Link>)}
    </div>)}
  </Screen>;
}
