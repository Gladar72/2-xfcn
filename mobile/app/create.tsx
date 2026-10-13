import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Aurora, Btn, Glass, Mosya, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { api, ApiError } from "@/lib/api";
import { coverFor, coverForText, coverUri } from "@/lib/covers";
import { catIcon, CATEGORY_SHORT, colors, eventIcon, FONT } from "@/lib/theme";
import type { MyProfile } from "@/lib/types";
import { type Category, type Form, formFromEvent, hhmm, initialForm, isPast, type TrainingType } from "@/components/create/model";
import { StepWhat } from "@/components/create/StepWhat";
import { StepCover } from "@/components/create/StepCover";
import { StepWhen } from "@/components/create/StepWhen";
import { StepWho } from "@/components/create/StepWho";

/**
 * Создание (и правка) встречи в 4 шага — как CreateMeetingFlow в мини-приложении:
 *   1. Что планируем — категория, вид тренировки, «Своё предложение»
 *   2. Название и обложка — обложку подбирает Мося, можно своё фото
 *   3. Когда и где — день, время, длительность, место
 *   4. Кто и сколько — люди, расходы, открыто/анонимно, превью
 * Параметры: id — правка своей встречи; business=1 — событие «Для бизнеса»;
 * category / type — заранее выбранная категория; invite / inviteName — после
 * публикации сразу позвать человека.
 */

const TG_BOT = "https://t.me/Mesto_people_bot";
/** Ошибки про тариф — тарифы пока покупаются в боте. */
const PLAN_ERRORS = ["subscription_required", "events_limit_reached", "group_size_exceeds_plan"];
/** Поле из ответа сервера → шаг, где его поправить. */
const FIELD_STEP: Record<string, number> = {
  categorySlug: 1,
  trainingTypeSlug: 1,
  title: 2,
  description: 2,
  photoBase64: 2,
  placeName: 3,
  address: 3,
  latitude: 3,
  longitude: 3,
  eventDate: 3,
  eventTime: 3,
  eventEndTime: 3,
  seatsTotal: 4,
  isAnonymous: 4,
};

type Params = { id?: string; business?: string; category?: string; type?: string; invite?: string; inviteName?: string };

export default function CreateScreen() {
  const params = useLocalSearchParams<Params>();
  const editId = params.id || undefined;
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [form, setForm] = useState<Form>(() =>
    initialForm(params.business === "1" || params.business === "true", params.category ?? null, params.type ?? null)
  );
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const [minSeats, setMinSeats] = useState(1);
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [me, setMe] = useState<{ name: string; avatarUrl: string | null; city: string | null } | null>(null);
  const [loading, setLoading] = useState(!!editId);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ text: string; plan?: boolean } | null>(null);

  useEffect(() => {
    api<{ categories?: Category[]; trainingTypes?: TrainingType[] }>("/api/categories")
      .then((d) => {
        setCategories(d.categories ?? []);
        setTrainingTypes(d.trainingTypes ?? []);
      })
      .catch(() => {});
    api<MyProfile>("/api/me/profile")
      .then((p) => setMe({ name: p.name ?? "Ты", avatarUrl: p.avatarUrl ?? null, city: p.city ?? null }))
      .catch(() => {});
  }, []);

  // Правка встречи: заполняем шаги данными с сервера.
  useEffect(() => {
    if (!editId) return;
    api(`/api/events/${editId}`)
      .then((e) => {
        const { form: f, minSeats: m } = formFromEvent(e);
        setForm(f);
        setMinSeats(m);
      })
      .catch((e) => setBanner({ text: (e as Error).message }))
      .finally(() => setLoading(false));
  }, [editId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  const isOwn = form.categorySlug === "custom";
  const presetCover = isOwn ? coverForText(`${form.own} ${form.title}`) : coverFor(form.categorySlug, form.trainingTypeSlug, form.business);
  const useOwn = form.useOwnPhoto && !!form.ownPhoto;
  const shownCover = useOwn ? form.ownPhoto!.uri : coverUri(presetCover);
  const iconUri = form.business
    ? catIcon("business")
    : eventIcon({ category: form.categorySlug ? { slug: form.categorySlug } : null, trainingType: form.trainingTypeSlug ? { slug: form.trainingTypeSlug } : null });
  const catLabel =
    form.categorySlug === "training"
      ? trainingTypes.find((t) => t.slug === form.trainingTypeSlug)?.name ?? "Тренировка"
      : isOwn
        ? form.own || "Своё"
        : (form.categorySlug && CATEGORY_SHORT[form.categorySlug]) || "встречи";

  function problem(): string | null {
    if (step === 1) {
      if (!form.categorySlug) return "Выбери, что планируешь.";
      if (form.categorySlug === "training" && !form.trainingTypeSlug) return "Выбери вид тренировки.";
      if (isOwn && form.own.trim().length < 2) return "Напиши одним-двумя словами, чем займёмся — например «сапы». Так встречу найдут поиском";
    }
    if (step === 2 && form.title.trim().length < 3) return "Придумай название — хотя бы 3 буквы.";
    if (step === 2 && isOwn && !presetCover && !useOwn)
      return "Мося не нашёл обложку под твою встречу — загрузи своё фото, чтобы люди поняли, куда зовёшь.";
    if (step === 3) {
      if (form.duration < 60) return "Встреча должна длиться хотя бы час.";
      if (!editId && isPast(form.dayIso, form.startMin)) return "Дата и время встречи уже прошли — выбери другое время.";
      if (form.placeName.trim().length < 2) return "Выбери место из подсказок или введи его вручную.";
    }
    if (step === 4 && form.seatsTotal < 1) return "Нужен хотя бы 1 человек кроме тебя.";
    if (step === 4 && form.business && form.bizPricing === "ticket" && !form.ticketPrice.trim()) return "Укажи цену билета.";
    if (step === 4 && form.business && form.bizPricing === "custom" && !form.bizTerms.trim()) return "Опиши условия участия.";
    return null;
  }

  /** Место введено вручную — ищем точку по адресу: геокодер сервера, потом геокодер телефона. */
  async function locate(): Promise<boolean> {
    if (form.latitude !== undefined && form.longitude !== undefined) return true;
    const q = (form.address.trim() || form.placeName.trim()).trim();
    if (q.length >= 3) {
      const p = new URLSearchParams({ query: q });
      if (me?.city) p.set("city", me.city);
      const r = await api<{ suggestions?: { address: string; latitude: number; longitude: number }[] }>(`/api/geocode?${p}`).catch(() => null);
      const hit = r?.suggestions?.[0];
      if (hit) {
        set({ latitude: hit.latitude, longitude: hit.longitude, address: form.address.trim() || hit.address });
        return true;
      }
      const loc = await Location.geocodeAsync(me?.city ? `${me.city}, ${q}` : q).catch(() => []);
      if (loc[0]) {
        set({ latitude: loc[0].latitude, longitude: loc[0].longitude });
        return true;
      }
    }
    return false;
  }

  async function next() {
    setBanner(null);
    const h = problem();
    if (h) {
      setBanner({ text: h });
      return;
    }
    if (step === 1 && isOwn && !form.title) set({ title: form.own.trim() });
    if (step === 3) {
      setBusy(true);
      const ok = await locate();
      setBusy(false);
      if (!ok) {
        setBanner({ text: "Не нашли это место на карте — выбери его из подсказок или уточни адрес." });
        return;
      }
    }
    if (step < 4) setStep(step + 1);
    else publish();
  }

  function back() {
    setBanner(null);
    if (step > 1) setStep(step - 1);
    else router.back();
  }

  async function publish() {
    setBusy(true);
    const own = form.own.trim();
    const endTime = hhmm(form.startMin + form.duration);
    // При правке фото отправляем, только если его поменяли (новый data:URL или обложка Моси).
    const photoBase64 = useOwn ? form.ownPhoto!.data : presetCover ?? undefined;
    const body = {
      ...(editId ? { action: "update" } : {}),
      categorySlug: editId && form.business ? undefined : form.categorySlug,
      trainingTypeSlug: form.trainingTypeSlug ?? undefined,
      placeName: form.placeName.trim(),
      address: form.address.trim(),
      latitude: form.latitude,
      longitude: form.longitude,
      eventDate: form.dayIso,
      eventTime: hhmm(form.startMin),
      eventEndTime: endTime,
      seatsTotal: form.seatsTotal,
      costType: form.business ? undefined : form.costType,
      businessPricingType: form.business ? form.bizPricing : undefined,
      businessPricingDetails: form.business
        ? form.bizPricing === "ticket"
          ? `${form.ticketPrice.trim()} ₽`
          : form.bizPricing === "custom"
            ? form.bizTerms.trim()
            : undefined
        : undefined,
      title: form.title.trim(),
      description: [isOwn && own && !form.title.toLowerCase().includes(own.toLowerCase()) ? own : "", form.description].filter(Boolean).join(". "),
      isBusiness: form.business,
      isAnonymous: form.business ? false : form.isAnonymous,
      photoBase64,
    };
    try {
      if (editId) {
        await api(`/api/events/${editId}`, { method: "PATCH", body });
        router.replace(`/event/${editId}`);
        return;
      }
      const res = await api<{ eventId: string }>("/api/events", { method: "POST", body });
      if (params.invite) {
        const sent = await api("/api/conversations/direct", { body: { userId: params.invite, eventId: res.eventId } })
          .then(() => true)
          .catch(() => false);
        Alert.alert(
          sent ? "Готово!" : "Встреча готова",
          sent ? `${params.inviteName ?? "Человек"} получит приглашение` : "Приглашение не ушло — позови из профиля ещё раз"
        );
      }
      router.replace(`/event/${res.eventId}`);
    } catch (e) {
      const err = e as ApiError;
      const data = (err.data ?? {}) as { field?: unknown };
      const target = typeof data.field === "string" ? FIELD_STEP[data.field] : undefined;
      if (target && target !== step) setStep(target);
      setBanner({
        text: err.message || "Не получилось опубликовать встречу. Попробуй ещё раз.",
        plan: err instanceof ApiError && PLAN_ERRORS.includes(err.code),
      });
      setBusy(false);
    }
  }

  const label = editId ? "Правка " : form.business ? "Бизнес " : "";
  const cta = step === 4 ? (editId ? "Сохранить изменения" : "Опубликовать") : "Дальше";

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <View style={[st.head, { paddingTop: insets.top + 10 }]}>
        <RoundBtn onPress={back}>
          <Icon name={step > 1 ? "back" : "close"} />
        </RoundBtn>
        <View style={st.prog}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={[st.dot, i <= step && st.dotOn]} />
          ))}
        </View>
        <Text style={st.count}>{`${label}${step}/4`}</Text>
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={colors.violet} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {step === 1 ? <StepWhat form={form} set={set} categories={categories} trainingTypes={trainingTypes} /> : null}
            {step === 2 ? <StepCover form={form} set={set} presetCover={presetCover} catLabel={catLabel} /> : null}
            {step === 3 ? <StepWhen form={form} set={set} catLabel={catLabel} city={me?.city ?? null} /> : null}
            {step === 4 ? (
              <StepWho
                form={form}
                set={set}
                minSeats={minSeats}
                isEdit={!!editId}
                coverUri={shownCover}
                iconUri={iconUri}
                me={me}
                hint={(text) => setBanner({ text })}
              />
            ) : null}
          </ScrollView>

          <View style={[st.foot, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            {banner ? (
              <Glass strong style={st.banner}>
                <Mosya pose="think" size={44} />
                <View style={{ flex: 1, gap: 10 }}>
                  <Text style={st.bannerText}>{banner.text}</Text>
                  {banner.plan ? (
                    <Btn
                      kind="tg"
                      title="Выбрать тариф в Telegram"
                      icon={<Icon name="tg" color="#fff" size={18} />}
                      onPress={() => Linking.openURL(TG_BOT)}
                      style={{ height: 44 }}
                    />
                  ) : null}
                </View>
                <Pressable onPress={() => setBanner(null)} hitSlop={10}>
                  <Icon name="close" size={18} color={colors.grey} />
                </Pressable>
              </Glass>
            ) : null}
            <Btn
              kind={step === 4 ? "v" : "k"}
              title={busy && step === 4 ? (editId ? "Сохраняем…" : "Публикуем…") : cta}
              loading={busy && step !== 4}
              disabled={busy}
              onPress={next}
            />
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 20, paddingBottom: 6 },
  prog: { flex: 1, flexDirection: "row", gap: 6 },
  dot: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "rgba(108,59,255,0.15)" },
  dotOn: { backgroundColor: colors.violet },
  count: { minWidth: 44, textAlign: "right", fontFamily: FONT, fontSize: 13, color: colors.grey },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  foot: { paddingHorizontal: 20, paddingTop: 10, gap: 10, backgroundColor: "rgba(246,242,255,0.92)" },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 22, padding: 12 },
  bannerText: { fontFamily: FONT, fontSize: 14, lineHeight: 19, color: colors.ink },
});
