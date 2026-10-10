"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resizeImageFile } from "@/lib/photos/resize-image-client";
import { photoThumb } from "@/lib/photos/thumb";
import { interestIcon } from "@/lib/data/interests";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { Ic, Screen, Toast } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";

interface Profile {
  name: string;
  avatarUrl: string | null;
  photos?: string[];
  bio: string | null;
  interests?: { id: string; name: string }[];
}

/** «Мой профиль» (SCR.edit прототипа): до 3 фото, о себе, интересы. */
export default function EditProfilePage() {
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null);
  const [bio, setBio] = useState("");
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const slot = useRef(0);

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setP(d);
        setBio(d.bio ?? "");
      })
      .catch(() => {});
  }, []);

  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(null), 2600);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !p) return;
    const s = slot.current;
    setBusySlot(s);
    try {
      const dataUrl = await resizeImageFile(file, s === 0 ? 1600 : 1280, 0.82);
      const res = await fetch(s === 0 ? "/api/me/avatar" : "/api/me/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoBase64: dataUrl }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash(d.error === "photo_rejected" ? "Это фото не прошло проверку — выбери другое" : apiErrorText(d, "Не получилось загрузить фото", res.status));
        return;
      }
      if (s === 0) setP({ ...p, avatarUrl: d.avatarUrl, photos: [d.avatarUrl, ...(p.photos ?? []).slice(1)] });
      else setP({ ...p, photos: d.photos });
      flash("Фото добавлено");
    } catch {
      flash("Проблема с соединением");
    } finally {
      setBusySlot(null);
    }
  }

  async function removeExtra(url: string) {
    if (!p) return;
    const res = await fetch("/api/me/photos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setP({ ...p, photos: d.photos });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/me/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bio }) });
      if (res.ok) {
        flash("Сохранено");
        setTimeout(() => goBack(router, "/profile"), 600);
      } else flash("Не получилось сохранить");
    } finally {
      setSaving(false);
    }
  }

  const photos = p?.photos ?? (p?.avatarUrl ? [p.avatarUrl] : []);

  return (
    <>
      <Screen id="edit" anim="in" scrollClass="pb150">
        <div className="bar-top">
          <button className="rb gl" onClick={() => goBack(router, "/profile")} aria-label="Назад">
            <Ic n="back" />
          </button>
          <button className="sm" onClick={save} disabled={saving}>
            Сохранить
          </button>
        </div>
        <h1 className="t" style={{ marginTop: 18 }}>
          Мой <em>профиль</em>
        </h1>
        <p className="muted" style={{ margin: "8px 0 14px", fontSize: 15, lineHeight: 1.5 }}>
          До 3 фото. Первое — главное, оно на аватарке и в ленте людей. Нажми «+», чтобы загрузить со своего устройства.
        </p>
        <div className="phgrid">
          {[0, 1, 2].map((i) => {
            const src = photos[i];
            if (busySlot === i)
              return (
                <div key={i} className="phs gl">
                  <div className="sk" style={{ position: "absolute", inset: 0, borderRadius: 20 }} />
                </div>
              );
            if (src)
              return (
                <div key={i} className="phs gl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoThumb(src, 300)}
                    alt=""
                    onClick={() => {
                      if (i === 0) {
                        slot.current = 0;
                        input.current?.click();
                      }
                    }}
                  />
                  {i > 0 && (
                    <button className="x" onClick={() => removeExtra(src)} aria-label="Удалить фото">
                      <Ic n="close" c="xs" />
                    </button>
                  )}
                  {i === 0 && <span className="tag">главное</span>}
                </div>
              );
            return (
              <button
                key={i}
                className="phs gl"
                onClick={() => {
                  slot.current = i === 0 || !photos[0] ? 0 : i;
                  input.current?.click();
                }}
                aria-label="Добавить фото"
              >
                {i === 0 ? <div className="tgava">{(p?.name ?? "?").charAt(0).toUpperCase()}</div> : null}
                <span className="add" style={i === 0 ? { position: "relative", zIndex: 2 } : undefined}>
                  <Ic n="plus" c="s" />
                </span>
              </button>
            );
          })}
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />

        <span className="lbl">О себе</span>
        <label className="field gl ta">
          <textarea rows={3} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Чем живёшь, что любишь, с кем хочешь встречаться" />
        </label>

        <span className="lbl" style={{ display: "flex", justifyContent: "space-between" }}>
          Интересы
          <Link href="/profile/interests" style={{ color: "var(--violet)", fontSize: 13 }}>
            Изменить
          </Link>
        </span>
        <div className="itags">
          {(p?.interests ?? []).map((i) => (
            <span key={i.id} className="itag gl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={interestIcon(i.name)} alt="" />
              {i.name}
            </span>
          ))}
        </div>
      </Screen>
      <div className="foot" style={{ zIndex: 6 }}>
        <button className="btn v" onClick={save} disabled={saving}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
      <Toast text={toast} />
    </>
  );
}
