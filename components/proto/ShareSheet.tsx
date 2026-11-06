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

const TARGETS: { k: Target; short: string; bg: string }[] = [
  { k: "tg", short: "Telegram", bg: "#2AABEE" },
  { k: "tgs", short: "Сторис", bg: "linear-gradient(135deg,#2AABEE,#7A5CFF)" },
  { k: "ig", short: "Instagram", bg: "linear-gradient(135deg,#FEDA75,#FA7E1E,#D62976,#962FBF)" },
  { k: "wa", short: "WhatsApp", bg: "#25D366" },
  { k: "vk", short: "VK", bg: "#0077FF" },
];

/** Название в две строки, последнее слово — курсивом (как в прототипе). */
function titleTwo(t: string) {
  const s = t.trim();
  const i = s.lastIndexOf(" ");
  if (i < 3 || s.length > 34) return s;
  return (
    <>
      {s.slice(0, i)}
      <br />
      <em>{s.slice(i + 1)}</em>
    </>
  );
}

function Glyph({ k }: { k: Target }) {
  const s = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "#fff", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (k === "tg") return <svg {...s}><path d="M21 4 3 11l6 2.5M21 4l-3 16-9-6.5M21 4 9 13.5V19l3-3" /></svg>;
  if (k === "tgs") return <svg {...s}><circle cx="12" cy="12" r="8.5" strokeDasharray="4 2.2" /><path d="M15.5 8.5 7.5 12l3 1.2m5-4.7-1.4 7-3.6-2.3m5-4.7-5 4.7" /></svg>;
  if (k === "ig") return <svg {...s}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r=".6" fill="#fff" /></svg>;
  if (k === "wa") return <svg {...s}><path d="M4 20l1.3-4A8 8 0 1 1 8.4 19z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-1.9-.9-.8.8a4 4 0 0 1-2-2l.8-.8-.9-1.9z" /></svg>;
  return <svg {...s}><path d="M3.5 7.5h3c.5 3 2 5 3.5 5.5v-5.5h2.8v3.3c1.5-.3 3-2 3.5-3.3h2.8c-.5 2-2.3 4-3.6 4.7 1.3.6 3.3 2.3 4 4.3H16.4c-.6-1.5-2-2.8-3.6-3v3H11.5C7 16.5 4 13 3.5 7.5z" /></svg>;
}

/** Короткий ключ версии картинки (djb2) — новый при любой правке события. */
function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
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
  version = "",
  photo,
  chip,
  meta,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  title: string;
  when: string;
  /** Обложка/название/время — меняются при правке; от них зависит адрес картинки, чтобы не брать старую из кэша. */
  version?: string;
  /** Для превью сторис как в прототипе: обложка, чип «Бег · Сб, 08:00», строка «Место · 3 из 10». */
  photo?: string | null;
  chip?: string;
  meta?: string;
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
  // s3 — версия оформления сторис («Афиша», 29.10): при смене дизайна старые картинки в кэше CDN не показываются.
  const v = hashKey(`s4|${version}|${title}|${when}`);
  const storyUrl = `${origin}/api/events/${eventId}/story.png?v=${v}`;
  const igUrl = `${storyUrl}&ig=1`;
  // Картинку для сторис рисуем заранее, пока человек смотрит событие: к нажатию
  // «Поделиться» она уже готова (в кэше браузера и CDN), а не рисуется 3–5 секунд.
  useEffect(() => {
    if (!origin || !eventId) return;
    const t = setTimeout(() => {
      const im = new Image();
      im.decoding = "async";
      im.src = storyUrl;
    }, open ? 0 : 1200);
    return () => clearTimeout(t);
  }, [origin, eventId, storyUrl, open]);
  useEffect(() => {
    if (!open || !origin) return;
    const im = new Image();
    im.src = igUrl;
  }, [open, origin, igUrl]);

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
          <h2 className="t" style={{ margin: "0 0 4px" }}>
            Поделиться <em>встречей</em>
          </h2>
          {/* Превью сторис — как в прототипе. */}
          <div className="K" style={{ display: "contents" }}>
            <div className="k-story" style={photo ? { backgroundImage: `url(${photo})` } : { background: "linear-gradient(160deg,#3A3646,#17141F)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="k-swm" src="/brand/auth/wordmark-white.svg" alt="" />
              <span className="k-schip">{chip ?? when}</span>
              <span className={`k-stt ${title.trim().length > 40 ? "k-stt3" : title.trim().length > 22 ? "k-stt2" : ""}`}>{titleTwo(title)}</span>
              {meta && <span className="k-sme">{meta}</span>}
              <span className="k-scta">Пойти со мной →</span>
            </div>
            <div className="k-shr2">
              {TARGETS.map((t) => (
                <button key={t.k} className="k-pr" onClick={() => pick(t.k)}>
                  <span style={{ background: t.bg }}>
                    <Glyph k={t.k} />
                  </span>
                  {t.short}
                </button>
              ))}
              <button className="k-pr" onClick={copy}>
                <span style={{ background: "#17141F" }}>
                  <Ic n={copied ? "check" : "copy"} />
                </span>
                {copied ? "Готово" : "Ссылка"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={igUrl} alt="Сторис для Instagram" width={110} height={196} style={{ flex: "none", width: 110, height: 196, borderRadius: 14, objectFit: "cover", background: "#17141F" }} />
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
