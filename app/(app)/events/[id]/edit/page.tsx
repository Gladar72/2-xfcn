"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Icon } from "@/components/brand/Icon";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LocationPicker } from "@/components/map/LocationPicker";
import { PhotoCropModal } from "@/components/create-event/PhotoCropModal";
import { searchAddress, type AddressSuggestion } from "@/lib/maps/forward-geocode";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { CATEGORY_ICON } from "@/lib/data/category-icons";
import { photoThumb } from "@/lib/photos/thumb";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}
interface TrainingType {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

interface EventDetails {
  id: string;
  title: string;
  description: string | null;
  category: { slug: string; name: string; emoji: string | null } | null;
  trainingType: { slug: string; name: string; emoji: string | null } | null;
  placeName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  eventDate: string;
  eventTime: string;
  eventEndTime: string | null;
  seatsTotal: number;
  seatsTaken: number;
  status: string;
  costType: string | null;
  isBusiness: boolean;
  businessPricingType: "ticket" | "free" | "custom" | null;
  businessPricingDetails: string | null;
  photoUrl: string | null;
  isAnonymous?: boolean;
  viewerStatus: "organizer" | "accepted" | "pending" | "rejected" | "none";
}

const inputClass =
  "block w-full max-w-full min-w-0 box-border rounded-card border border-lavender-200 bg-white px-4 py-3 text-base text-ink-900 outline-none focus:border-accent";

interface EditEventPageProps {
  params: { id: string };
}

export default function EditEventPage({ params }: EditEventPageProps) {
  const { id: eventId } = params;
  const router = useRouter();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [trainingTypeSlug, setTrainingTypeSlug] = useState<string | null>(null);
  const [placeName, setPlaceName] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [seatsTotal, setSeatsTotal] = useState(4);
  const [seatsTaken, setSeatsTaken] = useState(0);
  const [costType, setCostType] = useState<"each_pays" | "organizer_treats" | "free" | "negotiable">("each_pays");
  const [businessPricingType, setBusinessPricingType] = useState<"ticket" | "free" | "custom" | null>(null);
  const [businessTicketPrice, setBusinessTicketPrice] = useState("");
  const [businessCustomTerms, setBusinessCustomTerms] = useState("");
  const [isBusiness, setIsBusiness] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [newPhotoBase64, setNewPhotoBase64] = useState<string | undefined>();
  const [cropSrc, setCropSrc] = useState<string | undefined>();

  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [pickedFromAddress, setPickedFromAddress] = useState<{ latitude: number; longitude: number } | null>(null);
  const suppressAddressSearchRef = useRef(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/events/${eventId}`).then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ])
      .then(([eventData, categoriesData]) => {
        if (eventData.error) {
          setLoadError("Встреча не найдена.");
          return;
        }
        if (eventData.viewerStatus !== "organizer") {
          setLoadError("Редактировать событие может только организатор.");
          return;
        }
        const e: EventDetails = eventData;
        setEvent(e);
        setTitle(e.title);
        setDescription(e.description ?? "");
        setCategorySlug(e.category?.slug ?? null);
        setTrainingTypeSlug(e.trainingType?.slug ?? null);
        setPlaceName(e.placeName ?? "");
        setAddress(e.address ?? "");
        setLatitude(e.latitude ?? undefined);
        setLongitude(e.longitude ?? undefined);
        setEventDate(e.eventDate);
        setEventTime(e.eventTime.slice(0, 5));
        setEventEndTime(e.eventEndTime?.slice(0, 5) ?? "");
        setSeatsTotal(e.seatsTotal);
        setSeatsTaken(e.seatsTaken);
        setIsBusiness(e.isBusiness);
        setIsAnonymous(!!e.isAnonymous);
        setPhotoUrl(e.photoUrl);
        if (e.isBusiness) {
          setBusinessPricingType(e.businessPricingType);
          if (e.businessPricingType === "ticket") setBusinessTicketPrice(e.businessPricingDetails ?? "");
          if (e.businessPricingType === "custom") setBusinessCustomTerms(e.businessPricingDetails ?? "");
        } else if (e.costType) {
          setCostType(e.costType as typeof costType);
        }
        setCategories(categoriesData.categories ?? []);
        setTrainingTypes(categoriesData.trainingTypes ?? []);
      })
      .catch(() => setLoadError("Проблема с соединением."))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    if (suppressAddressSearchRef.current) {
      suppressAddressSearchRef.current = false;
      return;
    }
    if (address.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }
    const timeout = setTimeout(() => {
      searchAddress(address).then(setAddressSuggestions);
    }, 400);
    return () => clearTimeout(timeout);
  }, [address]);

  function handlePickAddressSuggestion(s: AddressSuggestion) {
    suppressAddressSearchRef.current = true;
    setAddress(s.address);
    setLatitude(s.latitude);
    setLongitude(s.longitude);
    setPickedFromAddress({ latitude: s.latitude, longitude: s.longitude });
    setAddressSuggestions([]);
  }

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  const canSave =
    title.trim().length >= 3 &&
    placeName.trim().length >= 2 &&
    latitude !== undefined &&
    longitude !== undefined &&
    eventDate.length > 0 &&
    eventTime.length > 0 &&
    eventEndTime.length > 0 &&
    seatsTotal >= seatsTaken &&
    (isBusiness ||
      (categorySlug !== null && (categorySlug !== "training" || trainingTypeSlug !== null)));

  /** Почему пока нельзя сохранить — чтобы не было молчаливой серой кнопки. */
  function saveHint(): string {
    if (title.trim().length < 3) return "Название встречи — минимум 3 символа.";
    if (placeName.trim().length < 2) return "Укажи место встречи.";
    if (latitude === undefined || longitude === undefined) return "Отметь место встречи на карте.";
    if (!eventDate) return "Выбери дату встречи.";
    if (!eventTime || !eventEndTime) return "Укажи время начала и окончания.";
    if (seatsTotal < seatsTaken) return `Нельзя меньше ${seatsTaken} участников — столько уже подтверждено.`;
    if (!isBusiness && categorySlug === null) return "Выбери категорию встречи.";
    if (!isBusiness && categorySlug === "training" && trainingTypeSlug === null) return "Выбери вид тренировки.";
    return "Проверь, что все поля заполнены.";
  }

  async function handleSave() {
    if (!canSave) {
      setSaveError(saveHint());
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          title,
          description,
          categorySlug: isBusiness ? undefined : categorySlug,
          trainingTypeSlug: trainingTypeSlug ?? undefined,
          placeName,
          address,
          latitude,
          longitude,
          eventDate,
          eventTime,
          eventEndTime,
          seatsTotal,
          costType: isBusiness ? undefined : costType,
          businessPricingType: isBusiness ? businessPricingType ?? undefined : undefined,
          businessPricingDetails: isBusiness
            ? businessPricingType === "ticket"
              ? businessTicketPrice
              : businessPricingType === "custom"
                ? businessCustomTerms
                : undefined
            : undefined,
          photoBase64: newPhotoBase64,
          isAnonymous: isBusiness ? undefined : isAnonymous,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(apiErrorText(data, "Не получилось сохранить изменения. Попробуй ещё раз.", res.status));
        setSaving(false);
        return;
      }
      setToast("Изменения сохранены");
      setTimeout(() => router.push(`/events/${eventId}`), 700);
    } catch {
      setSaveError("Проблема с соединением.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-ink-600">Загрузка...</p>
      </div>
    );
  }

  if (loadError || !event) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-red-600">{loadError ?? "Что-то пошло не так."}</p>
        <Link href={`/events/${eventId}`} className="text-sm font-medium text-accent">
          Вернуться к событию
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-28">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-lavender-100 bg-background/95 px-5 py-3 backdrop-blur">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm font-medium text-accent">
          <Icon name="back" size={22} className="" />
          Назад
        </button>
        <h1 className="text-base font-semibold text-ink-900">Редактировать событие</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`text-sm font-medium text-accent disabled:opacity-40 ${canSave ? "" : "opacity-40"}`}
        >
          Сохранить
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="relative aspect-[1.4] w-full overflow-hidden rounded-card-lg bg-lavender-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoThumb(newPhotoBase64 ?? photoUrl ?? undefined, 400)} alt="" className="h-full w-full object-cover" />
          <label className="absolute bottom-3 right-3 flex cursor-pointer items-center gap-1.5 rounded-pill bg-black/60 px-3 py-2 text-sm font-medium text-white">
            📷 Изменить фото
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </label>
        </div>

        <Field label="Название события" counter={`${title.length}/100`}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            className={inputClass}
          />
        </Field>

        {!isBusiness && (
          <Field label="Категория">
            <div className="grid grid-cols-2 gap-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCategorySlug(c.slug);
                    if (c.slug !== "training") setTrainingTypeSlug(null);
                  }}
                  className={`flex items-center gap-2 rounded-card p-3 text-left text-sm font-medium transition ${
                    categorySlug === c.slug ? "bg-brand-gradient text-white shadow-cta" : "m-glass text-ink-900"
                  }`}
                >
                  {CATEGORY_ICON[c.slug] ? (
                    <Image src={CATEGORY_ICON[c.slug] as string} alt="" width={28} height={28} className="object-contain" />
                  ) : (
                    <span className="text-xl leading-none">{c.emoji}</span>
                  )}
                  {c.name}
                </button>
              ))}
            </div>
            {categorySlug === "training" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {trainingTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTrainingTypeSlug(t.slug)}
                    className={`flex items-center gap-2 rounded-card p-2.5 text-left text-sm font-medium transition ${
                      trainingTypeSlug === t.slug ? "bg-brand-gradient text-white shadow-cta" : "m-glass text-ink-900"
                    }`}
                  >
                    <span className="text-xl leading-none">{t.emoji}</span>
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}

        <Field label="Дата и время">
          <div className="flex gap-2">
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className={`${inputClass} h-[52px] appearance-none text-center`}
            />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              className={`${inputClass} h-[52px] min-w-0 flex-1 appearance-none text-center`}
            />
            <span className="text-ink-400">–</span>
            <input
              type="time"
              value={eventEndTime}
              onChange={(e) => setEventEndTime(e.target.value)}
              className={`${inputClass} h-[52px] min-w-0 flex-1 appearance-none text-center`}
            />
          </div>
        </Field>

        <Field label="Место">
          <input
            value={placeName}
            onChange={(e) => setPlaceName(e.target.value)}
            placeholder="Название места"
            className={`mb-2 ${inputClass}`}
          />
          <div className="relative mb-2">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Адрес"
              className={`text-base ${inputClass}`}
            />
            {addressSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-card m-glass">
                {addressSuggestions.map((s) => (
                  <button
                    key={s.address}
                    type="button"
                    onMouseDown={() => handlePickAddressSuggestion(s)}
                    className="block w-full border-b border-lavender-100 px-4 py-2.5 text-left text-sm text-ink-900 last:border-0 hover:bg-lavender-50"
                  >
                    {s.address}
                  </button>
                ))}
              </div>
            )}
          </div>
          <LocationPicker
            onPick={({ latitude, longitude }) => {
              setLatitude(latitude);
              setLongitude(longitude);
            }}
            onAddressResolved={(resolved) => {
              suppressAddressSearchRef.current = true;
              setAddress(resolved);
            }}
            externalCoords={pickedFromAddress ?? (latitude && longitude ? { latitude, longitude } : null)}
            heightPx={220}
            markerIconSrc={isBusiness ? "/brand/markers/marker-business.png" : undefined}
          />
        </Field>

        <Field label="Участников (не считая тебя)" counter={`из ${seatsTaken > 0 ? `мин. ${seatsTaken}` : "30"}`}>
          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => {
                const min = Math.max(1, seatsTaken);
                if (seatsTotal <= min) {
                  setSaveError(
                    seatsTaken > 1
                      ? `Нельзя меньше ${seatsTaken} — столько человек уже подтверждено.`
                      : "Нужен хотя бы 1 участник кроме тебя."
                  );
                  return;
                }
                setSaveError(null);
                setSeatsTotal((n) => n - 1);
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full m-glass text-xl text-accent active:scale-95"
            >
              −
            </button>
            <span className="m-title w-12 text-center">{seatsTotal}</span>
            <button
              type="button"
              onClick={() => setSeatsTotal((n) => Math.min(isBusiness ? 500 : 30, n + 1))}
              className="flex h-12 w-12 items-center justify-center rounded-full m-glass text-xl text-accent active:scale-95"
            >
              +
            </button>
          </div>
          {seatsTaken > 0 && (
            <p className="mt-1 text-center text-xs text-ink-600">Уже подтверждено: {seatsTaken} чел. — меньше этого установить нельзя.</p>
          )}
        </Field>

        <Field label={isBusiness ? "Стоимость" : "Расходы"}>
          {isBusiness ? (
            <>
              <div className="flex flex-col gap-2">
                {(
                  [
                    ["ticket", "По билетам"],
                    ["free", "Бесплатно"],
                    ["custom", "Другие условия"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setBusinessPricingType(value)}
                    className={`rounded-card p-3 text-left text-sm font-medium transition ${
                      businessPricingType === value ? "bg-brand-gradient text-white shadow-cta" : "m-glass text-ink-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {businessPricingType === "ticket" && (
                <input
                  value={businessTicketPrice}
                  onChange={(e) => setBusinessTicketPrice(e.target.value)}
                  placeholder="Например: 1500 ₽"
                  maxLength={50}
                  className={`mt-2 ${inputClass}`}
                />
              )}
              {businessPricingType === "custom" && (
                <textarea
                  value={businessCustomTerms}
                  onChange={(e) => setBusinessCustomTerms(e.target.value)}
                  maxLength={300}
                  rows={3}
                  className={`mt-2 resize-none text-base ${inputClass}`}
                />
              )}
            </>
          ) : (
            <div className="flex flex-col gap-2">
              {(
                [
                  ["each_pays", "Каждый за себя"],
                  ["organizer_treats", "Автор угощает"],
                  ["free", "Без расходов"],
                  ["negotiable", "По договорённости"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCostType(value)}
                  className={`rounded-card p-3 text-left text-sm font-medium transition ${
                    costType === value ? "bg-brand-gradient text-white shadow-cta" : "m-glass text-ink-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Описание" counter={`${description.length}/500`}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={4}
            className={`resize-none text-base ${inputClass}`}
          />
        </Field>

        {!isBusiness && (
          <button
            type="button"
            role="switch"
            aria-checked={isAnonymous}
            onClick={() => setIsAnonymous((v) => !v)}
            className="flex w-full items-center gap-3 rounded-card m-glass p-4 text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/3d/icon-mask.png" alt="" className="h-8 w-8 object-contain" />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-ink-900">Анонимная встреча</span>
              <span className="block text-xs text-ink-600">
                Твои имя, фото и точный адрес увидят только те, чью заявку ты одобришь
              </span>
            </span>
            <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${isAnonymous ? "bg-accent" : "bg-lavender-200"}`}>
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${isAnonymous ? "left-[22px]" : "left-0.5"}`}
              />
            </span>
          </button>
        )}


        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full rounded-pill bg-brand-gradient py-4 text-base font-semibold text-white shadow-cta disabled:opacity-40 ${canSave ? "" : "opacity-40"}`}
        >
          {saving ? "Сохраняем..." : "Сохранить изменения"}
        </button>
      </div>

      {/* Ошибка — плашкой поверх экрана, чтобы её было видно, даже если
          «Сохранить» нажали в шапке, а форма прокручена вверх. */}
      {saveError && (
        <div className="fixed inset-x-5 bottom-28 z-40">
          <div
            role="alert"
            onClick={() => setSaveError(null)}
            className="rounded-card bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700 shadow-card-lg"
          >
            {saveError}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-28 z-40 flex justify-center px-5">
          <span className="rounded-pill bg-ink-900 px-4 py-2.5 text-sm font-medium text-white shadow-card-lg">{toast}</span>
        </div>
      )}

      {cropSrc && (
        <PhotoCropModal
          src={cropSrc}
          aspectRatio={1.4}
          onCancel={() => setCropSrc(undefined)}
          onConfirm={(dataUrl) => {
            setNewPhotoBase64(dataUrl);
            setCropSrc(undefined);
          }}
        />
      )}
    </div>
  );
}

function Field({ label, counter, children }: { label: string; counter?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card-lg m-glass p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-ink-600">{label}</span>
        {counter && <span className="text-xs text-ink-400">{counter}</span>}
      </div>
      {children}
    </div>
  );
}
