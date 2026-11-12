"use client";

import { useEffect, useState } from "react";
import { photoThumb } from "@/lib/photos/thumb";

interface Person { id: string; name: string; avatarUrl: string | null }

/**
 * Последний шаг создания встречи: «Кого позвать?» — люди, на которых ты подписан.
 * Отмеченным приглашение уходит сразу после публикации. Ниже — переключатель
 * «Позвать подписчиков» (встреча приходит всем, кто подписан на тебя).
 */
export function InviteFollowingPicker({
  selected,
  onChange,
  notify,
  onNotify,
  followersHidden,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  notify: boolean;
  onNotify: (v: boolean) => void;
  followersHidden?: boolean;
}) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [followers, setFollowers] = useState(0);
  const [all, setAll] = useState(false);
  useEffect(() => {
    fetch("/api/me/follows?tab=following", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setPeople((d?.items ?? []) as Person[]);
        setFollowers(Number(d?.followers ?? 0));
      })
      .catch(() => setPeople([]));
  }, []);
  if (people === null) return null;
  const shown = all ? people : people.slice(0, 7);
  const rest = people.length - shown.length;
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const everyone = people.length > 0 && people.every((p) => selected.includes(p.id));

  return (
    <div className="k-invf">
      <div className="k-invh">
        <span className="k-lbl" style={{ margin: 0 }}>Кого позвать из подписок</span>
        {people.length > 1 && (
          <button type="button" className="k-invall k-g k-pr" onClick={() => onChange(everyone ? [] : people.map((p) => p.id))}>
            {everyone ? "Снять всех" : "Выбрать всех"}
          </button>
        )}
      </div>
      {people.length === 0 ? (
        <p className="k-sub2" style={{ margin: 0 }}>Ты пока ни на кого не подписан. Подписаться можно в профиле человека — колокольчик.</p>
      ) : (
        <div className="k-pick k-g">
          {shown.map((p) => {
            const on = selected.includes(p.id);
            return (
              <button type="button" key={p.id} className={`k-pk${on ? " on" : ""}`} onClick={() => toggle(p.id)} aria-pressed={on}>
                <span className="k-pkav">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoThumb(p.avatarUrl, 60) ?? "/brand/mosya/mosya_wave.webp"} alt="" loading="lazy" />
                  {on && <span className="ck">✓</span>}
                </span>
                <span className="nm">{p.name.split(" ")[0]}</span>
              </button>
            );
          })}
          {rest > 0 && (
            <button type="button" className="k-pk" onClick={() => setAll(true)}>
              <span className="k-pkav"><span className="more">+{rest}</span></span>
              <span className="nm mut">ещё</span>
            </button>
          )}
        </div>
      )}
      {!followersHidden && (
        <button type="button" className="k-tgl k-g" onClick={() => onNotify(!notify)} aria-pressed={notify}>
          <span className="tx">
            <b>Позвать подписчиков</b>
            <small>{followers ? `Встреча придёт всем ${followers}, кто на тебя подписан` : "Встреча придёт всем, кто на тебя подпишется"}</small>
          </span>
          <span className={`k-sw${notify ? " on" : ""}`} />
        </button>
      )}
    </div>
  );
}
