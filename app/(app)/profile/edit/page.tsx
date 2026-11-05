"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProfilePhoto } from "@/components/profile/useProfilePhoto";
import { photoThumb } from "@/lib/photos/thumb";
import { interestIcon } from "@/lib/data/interests";
import { Ic, Screen, Toast } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";

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
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setP(d);
        setBio(d.bio ?? "");
        setName(d.name ?? "");
        const m = String(d.birthDate ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
        setBirthText(m ? `${m[3]}.${m[2]}.${m[1]}` : "");
      })
      .catch(() => {});
  }, []);

  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(null), 2600);
  }

  // Выбор фото → вертикальный редактор 3:4 → загрузка.
  const photo = useProfilePhoto({
    onDone: (r) => {
      if (!p) return;
      if (r.main) setP({ ...p, avatarUrl: r.avatarUrl, photos: [r.avatarUrl, ...(p.photos ?? []).slice(1)] });
      else setP({ ...p, photos: r.photos });
      flash("Фото добавлено");
    },
    onError: flash,
  });
  const busySlot = photo.busySlot;

  async function removeExtra(url: string) {
    if (!p) return;
    const res = await fetch("/api/me/photos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setP({ ...p, photos: d.photos });
  }

  async function save() {
    const nm = name.trim();
    if (nm.length < 2) return flash("Имя — минимум 2 буквы");
    const bm = birthText.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!bm) return flash("Дата рождения: ДД.ММ.ГГГГ");
    const birthDate = `${bm[3]}-${bm[2]}-${bm[1]}`;
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
                        photo.pick(0);
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
                  photo.pick(i === 0 || !photos[0] ? 0 : i);
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
        {photo.ui}

        <span className="lbl">Имя</span>
        <label className="field gl">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="Имя" />
        </label>
        <span className="lbl">Дата рождения</span>
        <label className="field gl">
          <input
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
