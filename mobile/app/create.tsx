import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Creature, K, KI, KRb, PearlBg, Press, kem, kf } from "@/components/k";
import { pickAndEdit } from "@/components/PhotoEditor";
import { CalendarSheet } from "@/components/create/CalendarSheet";
import { CoverStep, KindStep, N_DAYS, WhatStep, WhenStep, WhoStep, dayIndexOf, isoOfDay } from "@/components/create/KSteps";
import { guessBizCategory } from "@/lib/bizCategories";
import { API_URL } from "@/lib/config";
import { api, ApiError } from "@/lib/api";
import { coverFor, coverSetFor, coverForText, coverUri } from "@/lib/covers";
import { CATEGORY_SHORT } from "@/lib/theme";
import type { MyProfile } from "@/lib/types";
import { type Category, dayChip, dayLong, type Form, formFromEvent, hhmm, initialForm, isPast, type TrainingType } from "@/components/create/model";
import { getAnonDefault } from "@/lib/prefs";
import type { CityEvent } from "@/lib/cityEvents";
import { businessProblem, descriptionProblem, titleProblem } from "@/lib/eventQuality";
import { hasOrganizerPhoto } from "@/lib/photos";
import { OrganizerPhotoGate } from "@/components/create/OrganizerPhotoGate";
import { maybeAskReview } from "@/lib/review";
import type { Kind } from "@/components/create/KSteps";

/**
 * Создание (и правка) встречи в 4 шага — как CreateMeetingFlow в мини-приложении.
 * Перед шагами (только для новой) — «Что создаём?»: открытая, анонимная или событие для бизнеса.
 *   1. Что планируем — категория, вид тренировки, «Своё предложение»
 *   2. Название и обложка — обложку подбирает Мося, можно своё фото
 *   3. Когда и где — день, время, длительность, место
 *   4. Кто и сколько — люди, расходы, открыто/анонимно, превью
 * Параметры: id — правка своей встречи; business=1 — событие «Для бизнеса»;
 * category / type — заранее выбранная категория; invite / inviteName — после
 * публикации сразу позвать человека.
 */

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

type Params = { id?: string; business?: string; category?: string; type?: string; invite?: string; inviteName?: string; fromCity?: string; smokeStep?: string };

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
  // smokeStep — только для снимков экрана в тестовой сборке: сразу открыть нужный шаг.
  const smokeStep = process.env.EXPO_PUBLIC_UI_SMOKE === "1" && params.smokeStep ? Number(params.smokeStep) : 0;
  const [step, setStep] = useState(smokeStep || (params.business === "1" || params.business === "true" ? 2 : 1));
  // «Что создаём?» — пропускаем при правке, «Найти компанию» из афиши и приглашении человека.
  const skipKind = !!editId || !!params.fromCity || !!params.invite || !!smokeStep;
  const [chosen, setChosen] = useState(skipKind);
  const kind: Kind = form.business ? "business" : form.isAnonymous ? "anon" : "open";
  // Как в мини-аппе: выбор подсвечивается тёмным и через мгновение сам ведёт дальше (бизнес — сразу к названию).
  const [dir, setDir] = useState(1);
  // Выбор только подсвечивается — дальше человек сам жмёт «Далее».
  const [kindPicked, setKindPicked] = useState(false);
  function pickKind(k: Kind) {
    set({ business: k === "business", isAnonymous: k === "anon" });
    setKindPicked(true);
  }
  const [toast, setToast] = useState<string | null>(null);
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast((x) => (x === t ? null : x)), 2600);
  };
  const [calOpen, setCalOpen] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [plan, setPlan] = useState<"start" | "medium" | "premium" | null>(null);
  useEffect(() => {
    api<{ active?: boolean; plan?: string }>("/api/subscriptions")
      .then((d) => {
        if (d?.active && (d.plan === "start" || d.plan === "medium" || d.plan === "premium")) setPlan(d.plan);
      })
      .catch(() => {});
  }, []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [me, setMe] = useState<{ name: string; avatarUrl: string | null; city: string | null } | null>(null);
  const [loading, setLoading] = useState(!!editId);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ text: string; plan?: boolean } | null>(null);
  const [invited, setInvited] = useState(false);

  useEffect(() => {
    api<{ categories?: Category[]; trainingTypes?: TrainingType[] }>("/api/categories")
      .then((d) => {
        setCategories(d.categories ?? []);
        setTrainingTypes(d.trainingTypes ?? []);
      })
      .catch(() => {});
  }, []);

  // Профиль нужен до шагов: без фото открытую встречу не создать.
  const [profileState, setProfileState] = useState<"loading" | "ready" | "error">("loading");
  const [profileAttempt, setProfileAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setProfileState("loading");
    api<MyProfile>("/api/me/profile")
      .then((p) => {
        if (!alive) return;
        setMe({ name: p.name ?? "Ты", avatarUrl: p.avatarUrl ?? null, city: p.city ?? null });
        setProfileState("ready");
      })
      .catch(() => alive && setProfileState("error"));
    return () => {
      alive = false;
    };
  }, [profileAttempt]);

  // «Анонимно по умолчанию» из настроек приватности — только для новой обычной встречи.
  useEffect(() => {
    if (editId || form.business) return;
    getAnonDefault().then((v) => v && set({ isAnonymous: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // «Найти компанию» на событие из городской афиши — подставляем название, дату и место.
  useEffect(() => {
    if (!params.fromCity || editId) return;
    api<CityEvent>(`/api/city-events/${params.fromCity}`)
      .then((c) => {
        const title = `Пойдём вместе: ${c.title}`.slice(0, 80);
        const patch: Partial<Form> = { title, placeName: c.placeName ?? "", address: c.address ?? "" };
        if (form.categorySlug === "custom" || !form.categorySlug) patch.own = c.title.slice(0, 60);
        if (c.eventDate) patch.dayIso = isoOfDay(dayIndexOf(c.eventDate));
        if (c.eventTime) {
          const [h = 19, m = 0] = c.eventTime.split(":").map(Number);
          patch.startMin = h * 60 + Math.min(55, Math.round(m / 5) * 5);
        }
        if (c.latitude != null && c.longitude != null) {
          patch.latitude = c.latitude;
          patch.longitude = c.longitude;
        }
        set(patch);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.fromCity]);

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

  // Смена шага — как .k-wst мини-аппа: новый шаг въезжает сбоку (40 px) и проявляется за 0.45 с.
  const enter = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 450, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start();
  }, [step, chosen, enter]);

  // Бизнес-событие: раздел афиши подбираем по названию и описанию, пока человек пишет.
  useEffect(() => {
    if (!form.business || form.bizPicked) return;
    const g = guessBizCategory({ title: `${form.title} ${form.description}` });
    set({ bizCategory: g === "other" ? null : g });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.business, form.bizPicked, form.title, form.description]);

  const isOwn = form.categorySlug === "custom";
  const autoCover = isOwn ? coverForText(`${form.own} ${form.title}`) : coverFor(form.categorySlug, form.trainingTypeSlug, form.business);
  const coverSet = isOwn ? [] : coverSetFor(form.categorySlug, form.trainingTypeSlug, form.business);
  const presetCover = form.cover && coverSet.includes(form.cover) ? form.cover : coverSet[0] ?? autoCover;
  const useOwn = form.useOwnPhoto && !!form.ownPhoto;
  const shownCover = useOwn ? form.ownPhoto!.uri : coverUri(presetCover);
  const catLabel = form.business
    ? "событие"
    : form.categorySlug === "training"
      ? trainingTypes.find((t) => t.slug === form.trainingTypeSlug)?.name ?? "Тренировка"
      : isOwn
        ? form.own || "Своё"
        : (form.categorySlug && CATEGORY_SHORT[form.categorySlug]) || "встречи";

  function problem(): string | null {
    if (step === 1 && !form.business) {
      if (!form.categorySlug) return "Выбери, что планируешь.";
      if (form.categorySlug === "training" && !form.trainingTypeSlug) return "Выбери вид тренировки.";
      if (form.categorySlug === "training" && form.trainingTypeSlug === "custom" && !form.own.trim()) return "Выбери, какая тренировка.";
    }
    if (step === 2) {
      const own = form.own.trim();
      const t = titleProblem(form.title);
      if (t) return t;
      const fullDesc = [isOwn && own && !form.title.toLowerCase().includes(own.toLowerCase()) ? own : "", form.description].filter(Boolean).join(". ");
      const d = descriptionProblem(form.description);
      if (d) return d;
      // Мастер-классы и платные занятия — только через «Для бизнеса».
      if (!form.business) {
        const b = businessProblem(form.title, fullDesc);
        if (b) return b;
      }
    }
    if (step === 2 && form.business && !form.bizCategory) return "Выбери раздел в афише — так гости найдут событие в фильтрах.";
    if (step === 2 && form.business && !useOwn) return "Загрузи фото события — афишу, зал или сцену. Так гости поймут, куда идут.";
    if (step === 2 && isOwn && !presetCover && !useOwn)
      return "Мося не нашёл обложку под твою встречу — загрузи своё фото, чтобы люди поняли, куда зовёшь.";
    if (step === 3) {
      if (form.duration < 60) return "Встреча должна длиться хотя бы час.";
      if (!editId && isPast(form.dayIso, form.startMin)) return "Дата и время встречи уже прошли — выбери другое время.";
      if (form.placeName.trim().length < 2 || form.latitude === undefined || form.longitude === undefined) return "Выбери место из подсказок или отметь точку на карте.";
    }
    if (step === 4 && form.seatsTotal < 1) return "Нужен хотя бы 1 человек кроме тебя.";
    if (step === 4 && form.business && form.bizPricing === "ticket" && !form.ticketPrice.trim()) return "Укажи цену билета.";
    if (step === 4 && form.business && form.bizPricing === "custom" && !form.bizTerms.trim()) return "Опиши условия участия.";
    return null;
  }

  async function next() {
    setBanner(null);
    if (!chosen) {
      if (!kindPicked) {
        flash("Выбери формат — открытая, анонимная или для бизнеса");
        return;
      }
      setDir(1);
      setStep(form.business ? 2 : 1);
      setChosen(true);
      return;
    }
    const h = problem();
    if (h) {
      flash(h);
      return;
    }
    if (step === 1 && isOwn && !form.title) set({ title: form.own.trim() });
    if (step < 4) {
      setDir(1);
      setStep(step + 1);
    } else publish();
  }
  // Шаг 1 личной встречи — без «Далее»: выбор плитки сразу ведёт на следующий шаг.
  function goStep2() {
    /* выбор плитки только подсвечивается — переход по «Далее» */
  }

  function back() {
    setBanner(null);
    if (step > (form.business ? 2 : 1)) {
      setDir(-1);
      setStep(step - 1);
    } else if (chosen && !skipKind) {
      setDir(-1);
      setChosen(false);
    } else router.back();
  }

  async function uploadCover() {
    const p = await pickAndEdit({ title: form.business ? "Фото события" : "Обложка встречи", hint: "Двигай фото пальцем, двумя пальцами — приблизить. Так обложка будет выглядеть на карточке", previewTitle: form.title });
    if (p) set({ ownPhoto: p, useOwnPhoto: true });
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
      bizCategory: form.business ? form.bizCategory ?? undefined : undefined,
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
        if (sent) setInvited(true);
      }
      setPublishedId(res.eventId);
      setBusy(false);
      // Опубликовал встречу — удачный момент попросить оценку (не чаще раза в 3 месяца).
      if (!editId) maybeAskReview().catch(() => {});
    } catch (e) {
      const err = e as ApiError;
      const data = (err.data ?? {}) as { field?: unknown };
      if (err instanceof ApiError && err.code === "profile_photo_required") {
        // Старый аккаунт без фото: показываем загрузку фото, черновик остаётся.
        setMe((p) => ({ name: p?.name ?? "Ты", avatarUrl: null, city: p?.city ?? null }));
        setProfileState("ready");
        setBusy(false);
        return;
      }
      const target = typeof data.field === "string" ? FIELD_STEP[data.field] : undefined;
      if (target && target !== step) {
        setDir(-1);
        setStep(target);
      }
      setBanner({
        text: err.message || "Не получилось опубликовать встречу. Попробуй ещё раз.",
        plan: err instanceof ApiError && PLAN_ERRORS.includes(err.code),
      });
      setBusy(false);
    }
  }

  // Открытая встреча и событие для бизнеса — только с фото профиля; анонимная — без.
  const needsPhoto = !editId && chosen && kind !== "anon" && (profileState !== "ready" || !hasOrganizerPhoto(me?.avatarUrl));

  const hardMax = form.business ? 500 : 30;
  const planMax = plan ? (form.business ? { start: 40, medium: 100, premium: 500 }[plan] : { start: 4, medium: 10, premium: 30 }[plan]) : hardMax;
  const seatsCap = Math.max(Math.min(hardMax, planMax), editId ? form.seatsTotal : 0);
  const planName = plan === "medium" ? "Медиум" : plan === "premium" ? "Премиум" : "Старт";
  const steps = form.business ? [2, 3, 4] : [1, 2, 3, 4];
  const showFoot = !needsPhoto;
  const whenTxt = `${dayLong(form.dayIso)}, ${hhmm(form.startMin)}–${hhmm(form.startMin + form.duration)}`;

  /* ---------- «Встреча опубликована» — как в мини-аппе ---------- */
  if (publishedId) {
    const link = `${API_URL}/e/${publishedId}`;
    return (
      <View style={{ flex: 1, backgroundColor: K.pearl }}>
        <PearlBg />
        <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 20 }}>
          <KRb icon="back" onPress={() => router.replace(`/event/${publishedId}`)} accessibilityLabel="Назад" />
        </View>
        <View style={{ flex: 1, alignItems: "center", paddingTop: "6%", paddingHorizontal: 24 }}>
          <Creature size={220} variant="e" live />
          <Text style={[kf("300", 36, { lh: 1.14, ls: -0.035 }), { textAlign: "center", marginTop: 26 }]}>
            {form.business ? "Событие" : "Встреча"}
            {"\n"}
            <Text style={kem(38)}>опубликована</Text>
          </Text>
          <Text style={[kf("400", 14, { lh: 1.5, color: K.ink2 }), { textAlign: "center", marginTop: 10, maxWidth: 320 }]}>
            {invited && params.inviteName ? `Приглашение для ${params.inviteName} уже отправлено. ` : ""}
            {form.isAnonymous && !form.business
              ? "Встреча анонимная: имя, фото и адрес увидят только те, кого ты примешь."
              : "Подписчики и люди рядом увидят её первыми. Заявки придут в «Мои встречи»."}
          </Text>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 14), gap: 10 }}>
          <Press dark haptic onPress={() => Share.share({ message: `${form.title.trim()} — ${whenTxt}\n${link}` }).catch(() => {})} style={st.btnD}>
            <KI n="share" size={20} color="#fff" />
            <Text style={kf("500", 16, { color: "#fff" })}>Поделиться</Text>
          </Press>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Press onPress={() => router.replace(`/event/${publishedId}`)} style={[st.btnL, { flex: 1 }]}>
              <KI n="spark" size={18} />
              <Text style={kf("500", 15)}>Открыть</Text>
            </Press>
            <Press onPress={() => router.replace("/(tabs)/meet")} style={[st.btnL, { flex: 1 }]}>
              <Text style={kf("500", 15)}>Мои встречи</Text>
            </Press>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: K.pearl }}>
      <PearlBg />
      <View style={[st.head, { paddingTop: insets.top + 10 }]}>
        <KRb icon={step > (form.business ? 2 : 1) || (chosen && !skipKind) ? "back" : "x"} onPress={back} accessibilityLabel="Назад" />
        <View style={[st.prog, editId ? { opacity: 0 } : null]}>
          {steps.map((i) => (
            <View key={i} style={[st.dot, chosen && i <= step && st.dotOn]} />
          ))}
        </View>
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={K.ink} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 150 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={{
                opacity: enter,
                transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [dir * 40, 0] }) }],
              }}
            >
              {!chosen ? <KindStep value={kindPicked ? kind : null} onPick={pickKind} /> : null}
              {needsPhoto ? (
                <OrganizerPhotoGate
                  loading={profileState === "loading"}
                  error={profileState === "error"}
                  onRetry={() => setProfileAttempt((n) => n + 1)}
                  onUploaded={(avatarUrl) => {
                    setMe((p) => ({ name: p?.name ?? "Ты", avatarUrl, city: p?.city ?? null }));
                    setProfileState("ready");
                    setBanner(null);
                  }}
                />
              ) : null}
              {chosen && !needsPhoto && step === 1 ? <WhatStep form={form} set={set} categories={categories} trainingTypes={trainingTypes} next={goStep2} /> : null}
              {chosen && !needsPhoto && step === 2 ? <CoverStep form={form} set={set} covers={coverSet.length ? coverSet : presetCover ? [presetCover] : []} catLabel={catLabel} presetCover={presetCover} onUpload={uploadCover} /> : null}
              {chosen && !needsPhoto && step === 3 ? <WhenStep form={form} set={set} catLabel={catLabel} city={me?.city ?? null} onCalendar={() => setCalOpen(true)} flash={flash} /> : null}
              {chosen && !needsPhoto && step === 4 ? (
                <WhoStep
                  form={form}
                  set={set}
                  minSeats={minSeats}
                  seatsCap={seatsCap}
                  planName={planName}
                  planMax={planMax}
                  isEdit={!!editId}
                  skipKind={skipKind}
                  coverUri={shownCover}
                  catLabel={catLabel}
                  dayShort={dayChip(form.dayIso)}
                  flash={flash}
                  onPlans={() => router.push("/subscription")}
                />
              ) : null}
            </Animated.View>
          </ScrollView>

          {banner ? (
            <View style={[st.banner, { bottom: Math.max(insets.bottom, 14) + 70 }]}>
              <Creature size={40} variant="e" />
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={kf("400", 14, { lh: 1.4 })}>{banner.text}</Text>
                {banner.plan ? (
                  <Press dark onPress={() => router.push("/subscription")} style={[st.btnD, { height: 40 }]}>
                    <Text style={kf("500", 14, { color: "#fff" })}>Выбрать тариф</Text>
                  </Press>
                ) : null}
              </View>
              <Press onPress={() => setBanner(null)} style={{ padding: 4 }}>
                <KI n="x" size={16} color={K.ink2} />
              </Press>
            </View>
          ) : null}

          {showFoot ? (
            <View style={[st.foot, { paddingBottom: Math.max(insets.bottom, 14) }]}>
              {/* Фон не обрывается полосой: над кнопкой — мягкий переход в цвет экрана */}
              <LinearGradient pointerEvents="none" colors={["rgba(244,242,248,0)", "rgba(244,242,248,0.96)"]} style={st.footFade} />
              <Press dark haptic disabled={busy} onPress={next} style={st.btnD}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={kf("500", 16, { color: "#fff" })}>{step === 4 ? (editId ? "Сохранить изменения" : form.business ? "Опубликовать событие" : "Опубликовать") : "Далее"}</Text>
                )}
              </Press>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      )}

      {toast ? (
        <View pointerEvents="none" style={[st.toast, { bottom: Math.max(insets.bottom, 14) + 76 }]}>
          <Text style={[kf("500", 14, { lh: 1.4, color: "#fff" }), { textAlign: "center" }]}>{toast}</Text>
        </View>
      ) : null}
      <CalendarSheet open={calOpen} onClose={() => setCalOpen(false)} dayIndex={dayIndexOf(form.dayIso)} maxDays={N_DAYS} onPick={(i) => set({ dayIso: isoOfDay(i) })} />
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 20 },
  // .k-wprog — полоски шагов справа, не шире 150 px
  prog: { flexDirection: "row", gap: 5, flex: 1, maxWidth: 150, marginLeft: "auto" },
  dot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "rgba(23,20,31,0.12)" },
  dotOn: { backgroundColor: K.ink },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  foot: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 8, backgroundColor: "rgba(244,242,248,0.96)" },
  footFade: { position: "absolute", left: 0, right: 0, top: -36, height: 36 },
  btnD: { height: 54, borderRadius: 27, backgroundColor: K.ink, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  btnL: { height: 54, borderRadius: 27, backgroundColor: "rgba(255,255,255,0.66)", borderWidth: 1, borderColor: K.glassb, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  banner: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 22, padding: 12, backgroundColor: "rgba(255,255,255,0.96)", borderWidth: 1, borderColor: K.glassb, shadowColor: "rgb(40,20,100)", shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  toast: { position: "absolute", left: 20, right: 20, borderRadius: 20, paddingVertical: 11, paddingHorizontal: 16, backgroundColor: "rgba(23,20,31,0.92)" },
});
