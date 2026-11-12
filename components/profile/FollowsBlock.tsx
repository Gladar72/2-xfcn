"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/proto/ui";
import { KI } from "@/components/proto/k";
import { photoThumb } from "@/lib/photos/thumb";

type Tab = "followers" | "following";
interface Person { id: string; name: string; age: number | null; city: string | null; avatarUrl: string | null; iFollow: boolean; followsMe: boolean }
interface Summary { followers: number; following: number; followersPreview: { id: string; avatarUrl: string }[]; followingPreview: { id: string; avatarUrl: string }[] }

function plural(n: number, one: string, few: string, many: string) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few;
  return many;
}

/** Профиль: «Мои подписки» — две карточки (подписчики / подписки) и шторка со списком. */
export function FollowsBlock() {
  const [sum, setSum] = useState<Summary | null>(null);
  const [open, setOpen] = useState<Tab | null>(null);
  const load = useCallback(() => {
    fetch("/api/me/follows?summary=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Summary | null) => d && setSum(d))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  if (!sum) return null;

  const card = (tab: Tab, n: number, label: string, prev: { id: string; avatarUrl: string }[]) => (
    <button type="button" className="k-subc k-g k-pr" onClick={() => setOpen(tab)} aria-label={`${label}: ${n}. Открыть список`}>
      <span className="k-subx" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
      </span>
      <small>{label}</small>
      <b>{n}</b>
      <span className="k-ava">
        {prev.length
          ? prev.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={photoThumb(p.avatarUrl, 40)} alt="" loading="lazy" />
            ))
          : <span className="k-ava0">пока никого</span>}
      </span>
    </button>
  );

  return (
    <>
      <div className="k-sec">
        <div>
          <h3>
            Мои <em>подписки</em>
          </h3>
        </div>
      </div>
      <div className="k-subs">
        {card("followers", sum.followers, plural(sum.followers, "подписчик", "подписчика", "подписчиков"), sum.followersPreview)}
        {card("following", sum.following, plural(sum.following, "подписка", "подписки", "подписок"), sum.followingPreview)}
      </div>
      <p className="k-subn">Новые встречи тех, на кого ты подписан, приходят в Telegram</p>
      <FollowsSheet tab={open} counts={[sum.followers, sum.following]} onTab={setOpen} onClose={() => { setOpen(null); load(); }} />
    </>
  );
}

function FollowsSheet({ tab, counts, onTab, onClose }: { tab: Tab | null; counts: [number, number]; onTab: (t: Tab) => void; onClose: () => void }) {
  const [items, setItems] = useState<Person[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!tab) return;
    setItems(null);
    const c = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/me/follows?tab=${tab}&q=${encodeURIComponent(q)}`, { signal: c.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => setItems(d.items ?? []))
        .catch(() => {});
    }, q ? 250 : 0);
    return () => { clearTimeout(t); c.abort(); };
  }, [tab, q]);

  async function toggle(p: Person) {
    if (busy) return;
    setBusy(p.id);
    const on = !p.iFollow;
    setItems((list) => list?.map((x) => (x.id === p.id ? { ...x, iFollow: on } : x)) ?? null);
    const ok = await fetch("/api/follows", { method: on ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: p.id }) })
      .then((r) => r.ok)
      .catch(() => false);
    if (!ok) setItems((list) => list?.map((x) => (x.id === p.id ? { ...x, iFollow: !on } : x)) ?? null);
    setBusy(null);
  }

  return (
    <Sheet open={!!tab} onClose={onClose} cls="subs-sheet" label="Мои подписки">
      <h2 className="t">
        Мои <em>подписки</em>
      </h2>
      <div className="seg gl" role="tablist">
        <span className="si" style={{ width: "calc(50% - 4px)", transform: tab === "following" ? "translateX(100%)" : "none" }} />
        <button role="tab" aria-selected={tab === "followers"} className={tab === "followers" ? "on" : ""} onClick={() => onTab("followers")}>
          Подписчики · {counts[0]}
        </button>
        <button role="tab" aria-selected={tab === "following"} className={tab === "following" ? "on" : ""} onClick={() => onTab("following")}>
          Подписки · {counts[1]}
        </button>
      </div>
      <label className="field gl subs-q">
        <KI n="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти по имени" />
      </label>
      <div className="subs-list">
        {items === null && <p className="muted subs-empty">Загружаем…</p>}
        {items?.length === 0 && (
          <p className="muted subs-empty">
            {q ? "Никого не нашли" : tab === "followers" ? "Пока на тебя никто не подписан — создавай встречи, и люди подтянутся" : "Ты пока ни на кого не подписан. Подписаться можно в профиле человека — колокольчик"}
          </p>
        )}
        {items?.map((p) => (
          <div key={p.id} className="subrow gl">
            <Link href={`/people/${p.id}`} className="subrow-l">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoThumb(p.avatarUrl, 48) ?? "/brand/mosya/mosya_wave.webp"} alt="" loading="lazy" />
              <span className="d">
                <b>{p.name}{p.age ? `, ${p.age}` : ""}</b>
                <span>{[p.city, p.followsMe && tab === "following" ? "подписан(а) на тебя" : null].filter(Boolean).join(" · ")}</span>
              </span>
            </Link>
            <button type="button" className={`sbtn ${p.iFollow ? "lt" : "dk"}`} onClick={() => toggle(p)} disabled={busy === p.id}>
              {p.iFollow ? (p.followsMe ? "Взаимно" : "Подписан") : p.followsMe ? "В ответ" : "Подписаться"}
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
