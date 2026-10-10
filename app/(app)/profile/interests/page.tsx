"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { groupInterests, interestIcon } from "@/lib/data/interests";
import { Ic, Screen, Toast } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";

interface Interest {
  id: string;
  name: string;
  emoji: string | null;
}

/** «Что тебе по душе?» в режиме правки (SCR.interests с edit). */
export default function EditInterestsPage() {
  const router = useRouter();
  const [all, setAll] = useState<Interest[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/interests")
      .then((r) => r.json())
      .then((d) => setAll(d.interests ?? []))
      .catch(() => {});
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((d) => setSel((d.interests ?? []).map((i: { id: string }) => i.id)))
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/me/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interestIds: sel }) }).catch(() => null);
    setSaving(false);
    if (res?.ok) goBack(router, "/profile");
    else {
      setToast("Не получилось сохранить");
      setTimeout(() => setToast(null), 2400);
    }
  }

  const n = sel.length;
  return (
    <>
      <Screen id="interests" anim="in" scrollClass="pb160">
        <div className="bar-top">
          <button className="rb gl" onClick={() => goBack(router, "/profile")} aria-label="Назад">
            <Ic n="back" />
          </button>
          <span />
        </div>
        <h1 className="t" style={{ marginTop: 20 }}>
          Что тебе <em>по душе</em>?
        </h1>
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.5 }}>
          Выбери хотя бы три. По ним подберём встречи и людей с похожими интересами.
        </p>
        {groupInterests(all).map((g) => (
          <div key={g.title} className="igroup">
            <h3>
              {g.title}
              <span>{g.items.filter((x) => sel.includes(x.id)).length || ""}</span>
            </h3>
            <div className="igrid">
              {g.items.map((it) => (
                <button
                  key={it.id}
                  className={`it ${sel.includes(it.id) ? "sel" : ""}`}
                  onClick={() => setSel((s) => (s.includes(it.id) ? s.filter((x) => x !== it.id) : s.length >= 15 ? s : [...s, it.id]))}
                >
                  <span className="ck">
                    <Ic n="check" />
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={interestIcon(it.name)} alt="" />
                  {it.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Screen>
      <div className="foot" style={{ zIndex: 6 }}>
        <small>{n < 3 ? `Выбрано ${n} из 3` : `Выбрано: ${n}`}</small>
        <button className="btn v" disabled={n < 3 || saving} onClick={save}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
      <Toast text={toast} />
    </>
  );
}
