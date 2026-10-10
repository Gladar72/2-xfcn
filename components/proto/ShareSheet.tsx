"use client";

import { useState } from "react";
import { eventShareUrl } from "@/components/events/ShareEventButton";
import { Ic, Sheet } from "./ui";

/** «Поделиться встречей» (shareSheet прототипа): текст-приглашение, Telegram, копирование. */
export function ShareSheet({
  open,
  onClose,
  eventId,
  title,
  when,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  title: string;
  when: string;
}) {
  const [copied, setCopied] = useState(false);
  const link = eventShareUrl(eventId);
  const text = `${title} — ${when}. Пойдёшь со мной? 🙌`;

  function sendTg() {
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    const tg = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (u: string) => void } } }).Telegram?.WebApp;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, "_blank");
    onClose();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${text}\n${link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* без буфера обмена — просто ничего */
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="t">
        Поделиться <em>встречей</em>
      </h2>
      <div className="shbox gl">
        <b>{text}</b>
        <span>{link.replace(/^https?:\/\//, "")}</span>
      </div>
      <p className="muted" style={{ margin: "-4px 2px 0", fontSize: 13, lineHeight: 1.45 }}>
        Друг откроет ссылку — бот пришлёт карточку встречи с кнопкой «Открыть встречу».
      </p>
      <button className="btn tg" onClick={sendTg}>
        <Ic n="tg" />
        Отправить в Telegram
      </button>
      <button className="btn o" onClick={copy}>
        <Ic n={copied ? "check" : "copy"} />
        {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
      </button>
    </Sheet>
  );
}
