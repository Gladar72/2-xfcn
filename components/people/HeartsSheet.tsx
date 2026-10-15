"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mosyaSrc } from "@/components/brand/Mosya";
import { Ic, Sheet, Toast } from "@/components/proto/ui";
import { photoThumb } from "@/lib/photos/thumb";
import { say } from "@/lib/mosya/peek";

type Heart = {
  notificationId: string;
  unread: boolean;
  userId: string;
  name: string;
  age: number | null;
  avatarUrl: string | null;
  ratingAvg: number;
  meetings: number;
  commonInterests: string[];
};

const HEART = "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z";

/**
 * «Вам поставили сердечко» — шторка в профиле. Открывается сама, если есть новые
 * (непрочитанные) сердечки; плюс строка-кнопка в профиле, пока есть неотвеченные.
 */
export function HeartsSheet() {
  const router = useRouter();
  const [items, setItems] = useState<Heart[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mutual, setMutual] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/hearts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: Heart[] = d?.items ?? [];
        setItems(list);
        if (list.some((h) => h.unread)) setOpen(true);
      })
      .catch(() => {});
  }, []);

  function close() {
    setOpen(false);
    setMutual(false);
    const ids = items.filter((h) => h.unread).map((h) => h.notificationId);
    if (ids.length) {
      setItems((l) => l.map((h) => ({ ...h, unread: false })));
      fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => {});
    }
  }

  const h = items[0];
  if (!h) return null;
  const rest = items.length - 1;

  async function post(kind: "heart" | "hint") {
    if (busy || !h) return;
    setBusy(true);
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: h.userId, kind }),
      });
      if (res.status === 429) {
        say(kind === "heart" ? "Сегодня сердечки закончились — завтра будут новые" : "Намёков на сегодня хватит — завтра можно ещё");
        return;
      }
      if (!res.ok) return;
      if (kind === "heart") {
        setMutual(true);
      } else {
        setToast(`Намекнули ${h.name}: «Хочу на встречу» 👋`);
        setTimeout(() => setToast(null), 2600);
        next();
      }
    } finally {
      setBusy(false);
    }
  }

  function next() {
    // Убираем отвеченного; если больше никого — закрываем.
    setItems((l) => {
      const n = l.slice(1);
      if (n.length === 0) setOpen(false);
      return n;
    });
    setMutual(false);
  }

  return (
    <>
      <button
        className="gl"
        onClick={() => setOpen(true)}
        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", borderRadius: 22, border: 0, textAlign: "left", font: "inherit", color: "inherit", marginBottom: 12 }}
      >
        <span style={{ position: "relative", width: 44, height: 44, flex: "none" }}>
          {h.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoThumb(h.avatarUrl, 120)} alt="" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <span style={{ display: "block", width: 44, height: 44, borderRadius: "50%", background: "#EFE8FF" }} />
          )}
          <span style={{ position: "absolute", right: -4, bottom: -4, width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg,#FF8FB5,#FF4F8B)", border: "2px solid #fff", display: "grid", placeItems: "center" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
              <path d={HEART} />
            </svg>
          </span>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: "block", fontSize: 15 }}>{items.length > 1 ? `Вам поставили ${items.length} сердечка` : "Вам поставили сердечко"}</b>
          <span className="muted" style={{ fontSize: 13, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {items.length > 1 ? `${h.name} и ещё ${rest}` : h.name} · ответьте или позовите на встречу
          </span>
        </span>
        <Ic n="chev" />
      </button>

      <Sheet open={open} onClose={close}>
        <div style={{ display: "flex", justifyContent: "center", position: "relative", marginTop: 4 }}>
          <span style={{ position: "relative", width: 110, height: 110 }}>
            {h.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoThumb(h.avatarUrl, 240)} alt="" style={{ width: 110, height: 110, borderRadius: "50%", objectFit: "cover", border: "4px solid #fff", boxShadow: "0 14px 30px rgba(80,40,170,.3)" }} />
            ) : (
              <span style={{ display: "block", width: 110, height: 110, borderRadius: "50%", background: "#EFE8FF", border: "4px solid #fff" }} />
            )}
            <span style={{ position: "absolute", right: -2, bottom: 0, width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#FF8FB5,#FF4F8B)", border: "3px solid #fff", display: "grid", placeItems: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                <path d={HEART} />
              </svg>
            </span>
          </span>
        </div>
        <h2 className="t" style={{ textAlign: "center" }}>
          {mutual ? (
            <>
              Это <em>взаимно!</em>
            </>
          ) : (
            <>
              Вам поставили <em>сердечко</em>
            </>
          )}
        </h2>
        <p className="muted" style={{ margin: "-6px 4px 0", textAlign: "center", fontSize: 15, lineHeight: 1.45 }}>
          <b style={{ color: "#16121F" }}>
            {h.name}
            {h.age ? `, ${h.age}` : ""}
          </b>
          {h.meetings > 0 ? ` · ${h.meetings} встреч` : ""}
          {h.ratingAvg > 0 ? ` · ★ ${h.ratingAvg.toFixed(1)}` : ""}
          {h.commonInterests.length ? (
            <>
              <br />
              Общее: {h.commonInterests.slice(0, 3).join(", ").toLowerCase()}
            </>
          ) : null}
        </p>

        {mutual ? (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "4px 2px 0" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mosyaSrc("jump")} alt="" style={{ width: 54, height: 54, objectFit: "contain", flex: "none" }} />
              <span className="gl" style={{ borderRadius: 18, padding: "10px 12px", fontSize: 14, lineHeight: 1.4 }}>
                {`Ура! ${h.name} теперь знает, что это взаимно. Самое время позвать куда-нибудь`}
              </span>
            </div>
            <button className="btn v" onClick={() => router.push(`/people/${h.userId}`)}>
              <Ic n="cal" />
              Позвать на встречу
            </button>
            <button className="btn o" onClick={next}>
              {rest > 0 ? `Дальше · ещё ${rest}` : "Готово"}
            </button>
          </>
        ) : (
          <>
            <button className="btn v" onClick={() => router.push(`/people/${h.userId}`)}>
              <Ic n="cal" />
              Позвать на встречу
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn o" disabled={busy} onClick={() => post("heart")} style={{ flex: 1 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF4F8B" aria-hidden="true">
                  <path d={HEART} />
                </svg>
                В ответ
              </button>
              <button className="btn o" disabled={busy} onClick={() => post("hint")} style={{ flex: 1 }}>
                👋 Хочу на встречу
              </button>
            </div>
            {rest > 0 && (
              <button className="muted" onClick={next} style={{ background: "none", border: 0, font: "inherit", fontSize: 14, padding: 6 }}>
                {`Ещё ${rest} ${rest === 1 ? "человек поставил" : "человека поставили"} сердечко — смотреть`}
              </button>
            )}
          </>
        )}
      </Sheet>
      <Toast text={toast} />
    </>
  );
}
