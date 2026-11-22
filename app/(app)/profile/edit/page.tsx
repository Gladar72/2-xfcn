"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProfileGallery } from "@/components/profile/ProfileGallery";
import { interestIcon } from "@/lib/data/interests";
import { Ic, Screen, Toast } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";
import { getJson } from "@/lib/http/get-json";

interface Profile {
  name: string;
  birthDate?: string | null;
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
  const [name, setName] = useState("");
  const [birthText, setBirthText] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(false);
    getJson<Profile>("/api/me/profile", controller.signal)
      .then((d) => {
        if (controller.signal.aborted) return;
        setP(d);
        setBio(d.bio ?? "");
        setName(d.name ?? "");
        const m = String(d.birthDate ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
        setBirthText(m ? `${m[3]}.${m[2]}.${m[1]}` : "");
      })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true); });
    return () => controller.abort();
  }, [attempt]);

  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(null), 2600);
  }

  async function save() {
    if (!p || savingRef.current) return;
    const nm = name.trim();
    if (nm.length < 2) return flash("Имя — минимум 2 буквы");
    const bm = birthText.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!bm) return flash("Дата рождения: ДД.ММ.ГГГГ");
    const birthDate = `${bm[3]}-${bm[2]}-${bm[1]}`;
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio, name: nm, birthDate }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        flash("Сохранено");
        setTimeout(() => goBack(router, "/profile"), 600);
      } else
        flash(
          d.error === "under_18"
            ? "Сервис доступен только с 18 лет"
            : d.error === "invalid_birth_date"
              ? "Проверь дату рождения: ДД.ММ.ГГГГ"
              : d.error === "invalid_name"
                ? "Имя — от 2 до 50 букв"
                : "Не получилось сохранить"
        );
    } catch {
      flash("Не удалось сохранить профиль. Попробуй ещё раз.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }


  return (
    <>
      <Screen id="edit" anim="in" scrollClass="pb150">
        <div className="bar-top">
          <button className="rb gl" onClick={() => goBack(router, "/profile")} aria-label="Назад">
            <Ic n="back" />
          </button>
          <button className="sm" onClick={save} disabled={saving || !p}>
            Сохранить
          </button>
        </div>
        <h1 className="t" style={{ marginTop: 18 }}>
          Мой <em>профиль</em>
        </h1>
        {loadError && <div className="empty" role="alert">
          <b>Не удалось загрузить профиль.</b>
          <button className="btn v" onClick={() => setAttempt((n) => n + 1)}>Попробовать снова</button>
        </div>}
        {!p && !loadError && <p className="muted">Загружаем профиль…</p>}
        <p className="muted" style={{ margin: "8px 0 14px", fontSize: 15, lineHeight: 1.5 }}>
          До 3 фото. Первое — главное, оно на аватарке и в ленте людей. Нажми «+», чтобы загрузить со своего устройства.
        </p>
        {p && <ProfileGallery avatar={p.avatarUrl} photos={p.photos} flash={flash}
          onChange={next => setP(current => current ? { ...current, avatarUrl: next[0] ?? null, photos: next } : current)} />}

        <span className="lbl">Имя</span>
        <label className="field gl">
          <input disabled={!p} value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="Имя" />
        </label>
        <span className="lbl">Дата рождения</span>
        <label className="field gl">
          <input
            disabled={!p}
            value={birthText}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "").slice(0, 8);
              setBirthText([d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join("."));
            }}
            placeholder="ДД.ММ.ГГГГ"
            inputMode="numeric"
            maxLength={10}
          />
        </label>

        <span className="lbl">О себе</span>
        <label className="field gl ta">
          <textarea disabled={!p} rows={3} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Чем живёшь, что любишь, с кем хочешь встречаться" />
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
        <button className="btn v" onClick={save} disabled={saving || !p}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
      <Toast text={toast} />
    </>
  );
}
