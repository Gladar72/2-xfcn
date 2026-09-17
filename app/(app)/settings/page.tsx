"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getTelegramWebApp } from "@/lib/telegram/webapp-client";
import { CityPicker } from "@/components/ui/CityPicker";

interface ProfileSummary {
  name: string;
  city: string;
  morningRemindersEnabled: boolean;
}

const SUPPORT_BOT_URL = "https://t.me/Mesto_people_bot";

export default function SettingsPage() {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [editingCity, setEditingCity] = useState(false);
  const [cityDraft, setCityDraft] = useState("");
  const [savingCity, setSavingCity] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setProfile({ name: data.name, city: data.city, morningRemindersEnabled: data.morningRemindersEnabled ?? true });
      });
  }, []);

  function handleClose() {
    getTelegramWebApp()?.close();
  }

  async function toggleMorningReminders() {
    if (!profile) return;
    const next = !profile.morningRemindersEnabled;
    setProfile({ ...profile, morningRemindersEnabled: next }); // оптимистично — переключатель не должен ждать сети
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ morningRemindersEnabled: next }),
      });
      if (!res.ok) setProfile({ ...profile, morningRemindersEnabled: !next }); // откат при ошибке
    } catch {
      setProfile({ ...profile, morningRemindersEnabled: !next });
    }
  }

  function openCityEditor() {
    setCityDraft(profile?.city ?? "");
    setCityError(null);
    setEditingCity(true);
  }

  async function saveCity() {
    if (!cityDraft.trim() || cityDraft === profile?.city) {
      setEditingCity(false);
      return;
    }
    setSavingCity(true);
    setCityError(null);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: cityDraft }),
      });
      if (!res.ok) {
        setCityError("Не получилось сохранить город.");
        return;
      }
      setProfile((prev) => (prev ? { ...prev, city: cityDraft } : prev));
      setEditingCity(false);
    } finally {
      setSavingCity(false);
    }
  }

  return (
    <div className="px-5 py-4">
      <div className="mb-5 flex items-center gap-3">
        <Link href="/profile" aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </Link>
        <h1 className="text-title">Настройки</h1>
      </div>

      <Section title="Аккаунт">
        <Row href="/profile" label="Профиль" value={profile ? profile.name : undefined} icon="/brand/icons/profile.svg" />
        <Row href="/subscriptions" label="Мой тариф" icon="/brand/icons/gift.svg" />
        <Row href="/notifications" label="Уведомления" icon="/brand/icons/bell.svg" />
        {profile && (
          <ToggleRow
            label="Утренние приглашения"
            description="Иногда предлагаем идею на день — не чаще пары раз в неделю"
            checked={profile.morningRemindersEnabled}
            onChange={toggleMorningReminders}
          />
        )}
        <button onClick={openCityEditor} className="block w-full text-left">
          <div className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card">
            <Image src="/brand/icons/location.svg" alt="" width={18} height={18} />
            <span className="flex-1 text-sm text-ink-900">Город</span>
            {profile?.city && <span className="text-sm text-ink-400">{profile.city}</span>}
            <span className="text-ink-400">›</span>
          </div>
        </button>
      </Section>

      <Section title="Помощь">
        <Row external href={SUPPORT_BOT_URL} label="Написать в поддержку" icon="/brand/icons/help.svg" />
      </Section>

      <Section title="О приложении">
        <div className="rounded-card bg-white p-4 shadow-card">
          <div className="relative mb-4 h-6 w-24">
            <Image src="/brand/logo/wordmark-purple.svg" alt="МЕСТО" fill className="object-contain object-left" />
          </div>
          <p className="mb-2 text-sm font-medium text-ink-900">
            МЕСТО — когда есть куда пойти, но не с кем.
          </p>
          <p className="mb-2 text-sm text-ink-600">
            Приложение, которое объединяет людей через реальные планы и события.
          </p>
          <p className="mb-2 text-sm text-ink-600">
            Хочешь сходить в кино, позавтракать, выпить кофе, поужинать, прогуляться или потренироваться —
            создай встречу или присоединись к уже существующей.
          </p>
          <p className="text-sm text-ink-600">
            Здесь не нужно бесконечно листать анкеты и искать повод для знакомства. Сначала появляется место,
            идея или занятие — потом люди, которые хотят того же.
          </p>
        </div>

        <Row href="/legal/offer" label="Публичная оферта" icon="/brand/icons/info.svg" />
        <Row href="/legal/privacy" label="Политика конфиденциальности" icon="/brand/icons/lock.svg" />
      </Section>

      <button
        onClick={handleClose}
        className="mt-6 w-full rounded-pill border border-lavender-200 bg-white py-3.5 text-sm font-medium text-ink-600"
      >
        Закрыть приложение
      </button>

      {editingCity && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30"
          onClick={() => setEditingCity(false)}
        >
          <div
            className="rounded-t-sheet bg-white p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <h2 className="text-title mb-4">Город</h2>
            <CityPicker value={cityDraft} onChange={setCityDraft} autoFocus dropdownDirection="up" />
            {cityError && <p className="mt-2 text-sm text-red-600">{cityError}</p>}
            <button
              onClick={saveCity}
              disabled={savingCity || !cityDraft.trim()}
              className="mt-4 w-full rounded-pill bg-brand-gradient py-3.5 text-sm font-semibold text-white shadow-cta disabled:opacity-60"
            >
              {savingCity ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-ink-400">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  icon,
  href,
  external = false,
}: {
  label: string;
  value?: string;
  icon: string;
  href?: string;
  external?: boolean;
}) {
  const content = (
    <div className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card">
      <Image src={icon} alt="" width={18} height={18} />
      <span className="flex-1 text-sm text-ink-900">{label}</span>
      {value && <span className="text-sm text-ink-400">{value}</span>}
      {href && <span className="text-ink-400">›</span>}
    </div>
  );

  if (!href) return content;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return <Link href={href}>{content}</Link>;
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className="flex w-full items-center gap-3 rounded-card bg-white p-4 text-left shadow-card"
    >
      <div className="flex-1">
        <span className="block text-sm text-ink-900">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-400">{description}</span>}
      </div>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-pill transition-colors ${checked ? "bg-brand-gradient" : "bg-lavender-200"}`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </span>
    </button>
  );
}
