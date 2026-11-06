"use client";

import { useState } from "react";
import Link from "next/link";
import { Chr, Ic, Sheet } from "@/components/proto/ui";
import { photoThumb } from "@/lib/photos/thumb";

type Participant = { id: string; name: string; avatarUrl: string | null; anonymous?: boolean; mine?: boolean };

export function EventParticipants({ people, onAnonymous, onRemove, removingId }: {
  people: Participant[];
  onAnonymous: () => void;
  onRemove?: (id: string) => void;
  removingId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);
  const hidden = Math.max(0, people.length - 5);
  const firstName = (p: Participant) => p.mine ? "Ты" : p.anonymous ? p.name : p.name.trim().split(/\s+/)[0] || "Участник";
  const show = () => { setVisibleCount(30); setOpen(true); };
  const avatar = (p: Participant) => <span className={`participant-avatar${p.anonymous ? " k-free" : ""}`}>
    {p.anonymous ? <Chr shape="ball" pal="violet" face="hidden" /> : p.avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoThumb(p.avatarUrl, 56)} alt="" loading="lazy" />
    ) : p.name.charAt(0).toUpperCase()}
  </span>;
  function item(p: Participant, index: number, full = false) {
    const content = <>{avatar(p)}<span className="participant-name">{firstName(p)}</span>{full && !p.anonymous && <Ic n="chev" />}</>;
    const className = full ? "participant-row" : "k-wp";
    return p.anonymous ? (
      <button key={`anonymous-${index}`} className={className} onClick={() => { setOpen(false); onAnonymous(); }}>{content}</button>
    ) : <Link key={p.id} className={className} href={p.mine ? "/profile" : `/people/${p.id}`} onClick={() => setOpen(false)}>{content}</Link>;
  }
  return <>
    <div className="k-who participant-preview">
      {people.slice(0, 5).map((p, i) => item(p, i))}
      {hidden > 0 && <button className="k-wp participant-more" aria-label={`Показать всех участников: ${people.length}`} aria-haspopup="dialog" aria-expanded={open} onClick={show}>
        <span className="participant-avatar k-free">+{hidden}</span><span className="participant-name">все</span>
      </button>}
    </div>
    {(hidden > 0 || onRemove) && <button className="participant-expand" onClick={show} aria-haspopup="dialog" aria-expanded={open}>
      {onRemove ? "Управлять участниками" : "Показать всех"} · {people.length}<Ic n="chev" />
    </button>}
    <Sheet open={open} onClose={() => setOpen(false)} label="Кто идёт">
      <div className="participant-heading"><h2>Кто идёт · {people.length}</h2><button className="rb gl" aria-label="Закрыть список участников" onClick={() => setOpen(false)}><Ic n="close" /></button></div>
      <div className="participant-list">{people.slice(0, visibleCount).map((p, i) => <div className="participant-entry" key={p.id || `anonymous-${i}`}>
        {item(p, i, true)}
        {onRemove && !p.mine && <button className="sm no" disabled={!!removingId} aria-label={`Убрать участника ${firstName(p)}`} onClick={() => onRemove(p.id)}>{removingId === p.id ? "Убираем…" : "Убрать"}</button>}
      </div>)}</div>
      {visibleCount < people.length && <button className="btn o" onClick={() => setVisibleCount(n => n + 30)}>Показать ещё · {people.length - visibleCount}</button>}
    </Sheet>
  </>;
}
