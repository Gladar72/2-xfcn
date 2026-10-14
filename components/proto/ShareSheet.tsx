"use client";

import { useEffect, useState } from "react";
import { eventShareUrl } from "@/components/events/ShareEventButton";
import { getTelegramWebApp } from "@/lib/telegram/webapp-client";
import { Ic, Sheet } from "./ui";

/**
 * «Поделиться событием»: чат Telegram, сторис Telegram, сторис Instagram, WhatsApp, ВКонтакте,
 * копирование ссылки. Картинку для сторис рисует сервер: /api/events/[id]/story.png.
 *
 * Instagram не принимает ссылку от приложения — поэтому ссылку копируем заранее,
 * картинку отдаём в системное окно «Поделиться» (или сохраняем через Telegram),
 * а человек сам добавляет стикер «Ссылка» в пунктирную рамку.
 */
type Target = "tg" | "tgs" | "ig" | "wa" | "vk";

const TARGETS: { k: Target; label: string; bg: string }[] = [
  { k: "tg", label: "В чат\nTelegram", bg: "#2AABEE" },
  { k: "tgs", label: "Сторис\nTelegram", bg: "linear-gradient(135deg,#2AABEE,#6C3BFF)" },
  { k: "ig", label: "Сторис\nInstagram", bg: "linear-gradient(45deg,#F9A13A,#E1306C 50%,#8A3AB9)" },
  { k: "wa", label: "WhatsApp", bg: "#25D366" },
  { k: "vk", label: "ВКонтакте", bg: "#0077FF" },
];

function Glyph({ k }: { k: Target }) {
  const s = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "#fff", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (k === "tg") return <svg {...s}><path d="M21 4 3 11l6 2.5M21 4l-3 16-9-6.5M21 4 9 13.5V19l3-3" /></svg>;
  if (k === "tgs") return <svg {...s}><circle cx="12" cy="12" r="8.5" strokeDasharray="4 2.2" /><path d="M15.5 8.5 7.5 12l3 1.2m5-4.7-1.4 7-3.6-2.3m5-4.7-5 4.7" /></svg>;
  if (k === "ig") return <svg {...s}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r=".6" fill="#fff" /></svg>;
  if (k === "wa") return <svg {...s}><path d="M4 20l1.3-4A8 8 0 1 1 8.4 19z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-1.9-.9-.8.8a4 4 0 0 1-2-2l.8-.8-.9-1.9z" /></svg>;
  return <svg {...s}><path d="M3.5 7.5h3c.5 3 2 5 3.5 5.5v-5.5h2.8v3.3c1.5-.3 3-2 3.5-3.3h2.8c-.5 2-2.3 4-3.6 4.7 1.3.6 3.3 2.3 4 4.3H16.4c-.6-1.5-2-2.8-3.6-3v3H11.5C7 16.5 4 13 3.5 7.5z" /></svg>;
}

function openExternal(url: string) {
  const tg = getTelegramWebApp();
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank");
}

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
  const [mode, setMode] = useState<"list" | "ig">("list");
  const [storyOk, setStoryOk] = useState(false);
  const link = eventShareUrl(eventId);
  const text = `${title} — ${when}. Пойдёшь со мной? 🙌`;
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (open) setMode("list");
    const tg = getTelegramWebApp();
    setStoryOk(!!tg?.shareToStory && (tg.isVersionAtLeast?.("7.8") ?? false));
  }, [open]);
  const storyUrl = `${origin}/api/events/${eventId}/story.png`;
  const igUrl = `${storyUrl}?ig=1`;

  async function copyLink(withText = true): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(withText ? `${text}\n${link}` : link);
      return true;
    } catch {
      return false;
    }
  }

  function pick(k: Target) {
    const tg = getTelegramWebApp();
    if (k === "tg") {
      const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
      if (tg?.openTelegramLink) tg.openTelegramLink(url);
      else window.open(url, "_blank");
      onClose();
    } else if (k === "tgs") {
      if (tg?.shareToStory && storyOk) {
        tg.shareToStory(storyUrl, { text: `${title} — ${when}`.slice(0, 200), widget_link: { url: link, name: "Я иду" } });
        onClose();
      } else {
        // Старый Telegram без сторис из приложений — хотя бы ссылка в чат.
        pick("tg");
      }
    } else if (k === "ig") {
      void copyLink(false);
      setMode("ig");
    } else if (k === "wa") {
      openExternal(`https://wa.me/?text=${encodeURIComponent(`${text}\n${link}`)}`);
      onClose();
    } else {
      openExternal(`https://vk.com/share.php?url=${encodeURIComponent(link)}&title=${encodeURIComponent(title)}`);
      onClose();
    }
  }

  /** Картинку — в системное окно «Поделиться» (там есть Instagram → История), иначе сохраняем через Telegram. */
  async function openInstagram() {
    try {
      const blob = await fetch(igUrl).then((r) => r.blob());
      const file = new File([blob], "mesto-story.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch {
      /* окно закрыли или не поддерживается — ниже запасной путь */
    }
    const tg = getTelegramWebApp();
    if (tg?.downloadFile && (tg.isVersionAtLeast?.("8.0") ?? false)) {
      tg.downloadFile({ url: igUrl, file_name: "mesto-story.png" }, () => openExternal("https://www.instagram.com/"));
    } else {
      openExternal(igUrl);
    }
  }

  async function copy() {
    if (await copyLink()) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  const step = (n: number, t: string, s: string) => (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ flex: "none", width: 28, height: 28, borderRadius: 10, background: "var(--ink)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14 }}>{n}</span>
      <div style={{ display: "grid", gap: 2, paddingTop: 3 }}>
        <b style={{ fontSize: 15 }}>{t}</b>
        <span className="muted" style={{ fontSize: 13.5, lineHeight: 1.4 }}>{s}</span>
      </div>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose}>
      {mode === "list" ? (
        <>
          <h2 className="t">
            Поделиться <em>событием</em>
          </h2>
          <div className="gl" style={{ display: "flex", gap: 14, alignItems: "center", borderRadius: 20, padding: 12 }}>
            {origin && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={storyUrl} alt="Картинка для сторис" width={92} height={164} style={{ flex: "none", width: 92, height: 164, borderRadius: 12, objectFit: "cover", background: "#1B1230" }} />
            )}
            <div style={{ display: "grid", gap: 6 }}>
              <b style={{ fontSize: 15.5, lineHeight: 1.3 }}>Мося собрал картинку для сторис</b>
              <span className="muted" style={{ fontSize: 13.5, lineHeight: 1.4 }}>
                Обложка, время, место и сколько свободно. Друзья увидят и откроют событие по ссылке.
              </span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
            {TARGETS.map((t) => (
              <button key={t.k} onClick={() => pick(t.k)} style={{ border: 0, background: "none", display: "grid", justifyItems: "center", gap: 7, padding: 0, font: "inherit", color: "inherit" }}>
                <span style={{ width: 58, height: 58, borderRadius: 20, background: t.bg, display: "grid", placeItems: "center" }}>
                  <Glyph k={t.k} />
                </span>
                <span style={{ fontSize: 11.5, lineHeight: 1.2, textAlign: "center", whiteSpace: "pre-line", color: "var(--ink-2)" }}>{t.label}</span>
              </button>
            ))}
          </div>
          <button className="btn o" onClick={copy}>
            <Ic n={copied ? "check" : "copy"} />
            {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
          </button>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={igUrl} alt="Сторис для Instagram" width={110} height={196} style={{ flex: "none", width: 110, height: 196, borderRadius: 14, objectFit: "cover", background: "#1B1230" }} />
            <div style={{ display: "grid", gap: 8, paddingBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1E8A4C", background: "#E3F7EA", padding: "5px 10px", borderRadius: 99, width: "fit-content" }}>✓ Ссылка скопирована</span>
              <h2 className="t" style={{ margin: 0 }}>
                Сторис <em>готова</em>
              </h2>
            </div>
          </div>
          <div className="gl" style={{ display: "grid", gap: 12, borderRadius: 20, padding: 16 }}>
            {step(1, "Выбери Instagram → «История»", "Если картинка сохранилась в галерею — выбери её в сторис")}
            {step(2, "Добавь стикер «Ссылка»", "Ссылка уже скопирована — вставь её в пунктирную рамку")}
            {step(3, "Опубликуй", "Друзья нажмут на стикер и сразу откроют событие")}
          </div>
          <button
            className="btn"
            onClick={openInstagram}
            style={{ background: "linear-gradient(45deg,#F9A13A,#E1306C 50%,#8A3AB9)", color: "#fff" }}
          >
            <Glyph k="ig" />
            Открыть Instagram
          </button>
          <button className="btn o" onClick={() => setMode("list")}>
            Назад
          </button>
        </>
      )}
    </Sheet>
  );
}
